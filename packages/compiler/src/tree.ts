import {
  selectQuestion,
  summarize,
  update,
  type Engine,
  type IndexedAnswer,
  type Posterior,
  type Question,
} from "@dose-bench/engine";

/** Internal node: ask `questions[q]`, then go to `A` or `B`. */
export interface DecisionNode {
  readonly q: number;
  readonly A: number;
  readonly B: number;
}
/** Leaf: posterior [mean, sd] per parameter after the full sequence. */
export interface LeafNode {
  readonly est: Readonly<Record<string, readonly [number, number]>>;
}
export type TreeNode = DecisionNode | LeafNode;

export const isLeaf = (n: TreeNode): n is LeafNode => "est" in n;

/** A compiled DOSE module. Plain JSON: any platform that can follow two pointers can run it. */
export interface Tree<Q extends Question = Question> {
  readonly format: "dose-tree/1";
  readonly model: string;
  readonly length: number;
  readonly params: readonly string[];
  /** Only the questions the tree actually uses, referenced by index from decision nodes. */
  readonly questions: readonly Q[];
  /** Node 0 is the root. Nodes are in depth-first (pre-)order. */
  readonly nodes: readonly TreeNode[];
  readonly meta: {
    readonly compiledAt: string;
    readonly compiledMs: number;
    readonly gridPoints: number;
    readonly candidateQuestions: number;
  };
}

export interface CompileOptions {
  /** Questions per participant. The tree has 2^length - 1 decision nodes. Default 10. */
  readonly length?: number;
  /** Decimal places for leaf estimates. Default 3. */
  readonly decimals?: number;
  /** Called with a fraction in [0, 1]. */
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
  /** Yield to the event loop every N decision nodes so UIs stay responsive. Default 32; 0 disables. */
  readonly yieldEvery?: number;
}

const MAX_LENGTH = 16;

/**
 * Precompute every path through a DOSE module.
 *
 * Runs depth-first, so memory is O(length x grid size) rather than O(2^length x grid size).
 * The result asks exactly the questions a live DoseSession would ask for the same answers.
 */
export async function compileTree<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  options: CompileOptions = {},
): Promise<Tree<Q>> {
  const length = options.length ?? 10;
  if (!Number.isInteger(length) || length < 1 || length > MAX_LENGTH) {
    throw new RangeError(`compileTree: length must be an integer from 1 to ${MAX_LENGTH}`);
  }
  if (length > engine.nQuestions) throw new RangeError("compileTree: length exceeds the number of questions");
  const decimals = options.decimals ?? 3;
  const yieldEvery = options.yieldEvery ?? 32;
  const t0 = performance.now();

  const nodes: TreeNode[] = [];
  const used = new Map<number, number>();
  const totalDecisions = 2 ** length - 1;
  let decisions = 0;
  const round = (x: number) => Math.round(x * 10 ** decimals) / 10 ** decimals;

  const visit = async (p: Posterior, history: IndexedAnswer<Q>[]): Promise<number> => {
    options.signal?.throwIfAborted();
    const id = nodes.length;
    if (history.length === length) {
      const s = summarize(engine, p);
      const est: Record<string, readonly [number, number]> = {};
      for (const name of engine.grid.names) est[name] = [round(s.params[name].mean), round(s.params[name].sd)];
      nodes.push({ est });
      return id;
    }
    const { index } = selectQuestion(engine, p, history);
    if (index < 0) throw new Error("compileTree: ran out of eligible questions");
    if (!used.has(index)) used.set(index, used.size);
    nodes.push({ q: used.get(index)!, A: -1, B: -1 });
    decisions++;
    if (yieldEvery > 0 && decisions % yieldEvery === 0) {
      options.onProgress?.(decisions / totalDecisions);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    const question = engine.model.questions[index]!;
    const A = await visit(update(engine, p, index, true), [...history, { index, question, choseA: true }]);
    const B = await visit(update(engine, p, index, false), [...history, { index, question, choseA: false }]);
    nodes[id] = { q: used.get(index)!, A, B };
    return id;
  };

  await visit(engine.prior, []);
  options.onProgress?.(1);

  const questions = new Array<Q>(used.size);
  for (const [global, local] of used) questions[local] = engine.model.questions[global]!;

  return {
    format: "dose-tree/1",
    model: engine.model.id,
    length,
    params: [...engine.grid.names],
    questions,
    nodes,
    meta: {
      compiledAt: new Date().toISOString(),
      compiledMs: Math.round(performance.now() - t0),
      gridPoints: engine.nPoints,
      candidateQuestions: engine.nQuestions,
    },
  };
}

export interface TreeWalker<Q extends Question> {
  /** Current question, or null at a leaf. */
  readonly question: Q | null;
  /** Estimate at a leaf, otherwise null. */
  readonly estimate: LeafNode["est"] | null;
  readonly depth: number;
  readonly done: boolean;
  /** Answers given so far (true = A). */
  readonly path: readonly boolean[];
  answer(choseA: boolean): void;
  reset(): void;
}

/** Walk a compiled tree. No engine, no maths: this is all a survey platform has to run. */
export function treeWalker<Q extends Question>(tree: Tree<Q>): TreeWalker<Q> {
  let i = 0;
  let path: boolean[] = [];
  const node = () => tree.nodes[i]!;
  return {
    get question() {
      const n = node();
      return isLeaf(n) ? null : tree.questions[n.q]!;
    },
    get estimate() {
      const n = node();
      return isLeaf(n) ? n.est : null;
    },
    get depth() {
      return path.length;
    },
    get done() {
      return isLeaf(node());
    },
    get path() {
      return path;
    },
    answer(choseA: boolean) {
      const n = node();
      if (isLeaf(n)) throw new Error("treeWalker: already at a leaf");
      i = choseA ? n.A : n.B;
      path = [...path, choseA];
    },
    reset() {
      i = 0;
      path = [];
    },
  };
}
