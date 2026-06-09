
export type Role = 'user' | 'model';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  image?: string;
  /** Persistence status — undefined for pre-persistence messages or loaded history. */
  saveStatus?: 'pending' | 'saved' | 'failed';
  toolResults?: ToolResult[];
}

export interface ToolResult {
  tool: string;
  artifactType?: string;
  [key: string]: any;
}

export type ArtifactType =
  | 'TEXT'
  | 'HTML'
  | 'SCOREBOARD'
  | 'BETTING_ANALYSIS'
  | 'DATA_TABLE'
  | 'SPORTS_RESULTS'
  | 'ROSTER_RESULTS'
  | 'WORKSPACE_DOC'
  | 'JOB_MANIFEST'
  | 'SYSTEM_MESSAGE'
  | 'SYSTEM_ERROR';

export interface Source {
  title?: string;
  url?: string;
}

export interface ClientArtifact {
  type: ArtifactType;
  payload: any;
  sources?: Source[];
}
