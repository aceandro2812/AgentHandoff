import { HandoffPacket } from '../packet/schema.js';

export interface InjectionResult {
  files_written: string[];
  instructions: string;
}

export interface Injector {
  inject(packet: HandoffPacket, projectRoot: string): Promise<InjectionResult>;
  clean(projectRoot: string): Promise<string[]>;
}
