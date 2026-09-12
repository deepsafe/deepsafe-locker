export type Allocation = {
  id: number;
  beneficiary: string;
  tag: number;
  amount: bigint;
  released: bigint;
  vested: bigint;
  releasable: bigint;
  start: number;
  cliff: number;
  end: number;
  revokedAt: number;
};

export type AllocationFilter = "all" | "mine" | "active" | "complete";

export type AllocationForm = {
  beneficiary: string;
  tag: number;
  amount: string;
  start: string;
  cliff: string;
  end: string;
};
