
export type Role = 'user' | 'model';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  image?: string;
  /** Persistence status — undefined for pre-persistence messages or loaded history. */
  saveStatus?: 'pending' | 'saved' | 'failed';
}
