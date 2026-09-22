export interface HelloMessage {
  type: "zxcode-hello";
  version: string;
  platform: string;
  arch: string;
  pid: number;
}

export interface HelloAckMessage {
  type: "zxcode-hello-ack";
  version: string;
  clientId: string;
}
