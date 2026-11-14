export function escapePowerShellLiteral(value: string): string;
export function createEncodedPowerShellArgs(script: string, values?: readonly string[]): string[];
export function createWindowsPowerShellSecurityArgs(
  script: string,
  values?: readonly string[],
): string[];
