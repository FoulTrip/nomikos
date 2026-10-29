export type DeviceApp = "home" | "agent" | "config";
export type AIMode = string | null; // "simulated" o cualquier proveedor configurado

export interface OSMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
  mode?: AIMode;
}

export interface OSState {
  status: "booting" | "on";
  bootProgress: number; // 0..1
  app: DeviceApp;
  serverTime: number;
  battery: number;
  messages: OSMessage[];
  agentTyping: boolean;
  aiMode: AIMode;
}