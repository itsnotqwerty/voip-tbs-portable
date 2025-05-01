export interface IMessage {
  id: number;
  message: string;
  number_to: string;
  number_from: string;
  unix_timestamp: number;
}

export interface IAgent {
  agent_name: string;
  business_name: string;
  personality: string;
  directives: string;
  fallback_contact?: string;
  fallback_number?: string;
}