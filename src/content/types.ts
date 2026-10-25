/** Typed content-block model for migrated study-guide documents. */

export interface InlineText {
  type: 'text';
  text: string;
}

export interface InlineCode {
  type: 'code';
  text: string;
}

export interface InlineEmphasis {
  type: 'bold' | 'italic';
  children: InlineRun[];
}

export type InlineRun = InlineText | InlineCode | InlineEmphasis;

export interface HeadingBlock {
  type: 'heading';
  level: number;
  id: string;
  runs: InlineRun[];
}

export interface ParagraphBlock {
  type: 'paragraph';
  runs: InlineRun[];
}

export interface ListItem {
  runs: InlineRun[];
  subItems: ListItem[];
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
}

export interface TableBlock {
  type: 'table';
  header: InlineRun[][];
  rows: InlineRun[][][];
}

export interface CalloutBlock {
  type: 'callout';
  runs: InlineRun[];
}

export interface CodeBlock {
  type: 'code';
  lang: string;
  code: string;
}

export interface DividerBlock {
  type: 'divider';
}

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | CalloutBlock
  | CodeBlock
  | DividerBlock;

export interface StudyGuideDoc {
  /** Stable slug id used by the guide registry. */
  id: string;
  /** Human title derived from the source document's first heading (or explicit). */
  title: string;
  /** Provenance: source path relative to the dashboard public data root. */
  sourceFile: string;
  blocks: ContentBlock[];
}
