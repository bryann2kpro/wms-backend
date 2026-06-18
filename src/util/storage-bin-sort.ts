/**
 * Parse and compare storage bin codes in `{Aisle}-{Level}-{Position}` format
 * (e.g. A1-L1-01). Position is compared numerically, not lexically.
 */

export type ParsedStorageBin = {
  aisleLetter: string;
  aisleNumber: number;
  level: number;
  position: number;
  raw: string;
};

export function parseStorageBinCode(code: string | null | undefined): ParsedStorageBin | null {
  if (!code?.trim()) return null;

  const parts = code.trim().split('-');
  if (parts.length !== 3) return null;

  const [aislePart, levelPart, positionPart] = parts.map((part) => part.trim());
  if (!aislePart || !levelPart || !positionPart) return null;

  const aisleMatch = /^([A-Za-z]+)(\d+)$/.exec(aislePart);
  if (!aisleMatch) return null;

  const levelMatch = /^[Ll](\d+)$/.exec(levelPart);
  if (!levelMatch) return null;

  const position = Number.parseInt(positionPart, 10);
  if (Number.isNaN(position)) return null;

  return {
    aisleLetter: aisleMatch[1].toUpperCase(),
    aisleNumber: Number.parseInt(aisleMatch[2], 10),
    level: Number.parseInt(levelMatch[1], 10),
    position,
    raw: code.trim(),
  };
}

/** Compare two storage bin codes; unparsable codes sort after parsable ones. */
export function compareStorageBinCodes(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const parsedA = parseStorageBinCode(a);
  const parsedB = parseStorageBinCode(b);

  if (!parsedA && !parsedB) return (a ?? '').localeCompare(b ?? '');
  if (!parsedA) return 1;
  if (!parsedB) return -1;

  const letterCmp = parsedA.aisleLetter.localeCompare(parsedB.aisleLetter);
  if (letterCmp !== 0) return letterCmp;

  if (parsedA.aisleNumber !== parsedB.aisleNumber) {
    return parsedA.aisleNumber - parsedB.aisleNumber;
  }

  if (parsedA.level !== parsedB.level) {
    return parsedA.level - parsedB.level;
  }

  return parsedA.position - parsedB.position;
}

export function storageBinLabelFromParts(
  storageBin: string | null | undefined,
  rackRow?: string | null,
  rackLevel?: string | null,
  rackColumn?: string | null,
): string {
  if (storageBin?.trim()) return storageBin.trim();
  if (rackRow && rackLevel && rackColumn) {
    return `${rackRow}-${rackLevel}-${rackColumn}`;
  }
  return '';
}
