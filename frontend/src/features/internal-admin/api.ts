import { parseJson, stringifyJson } from "./json";
export type Row = Record<string, unknown>;
export type Column = {
  name: string;
  type: string;
  nullable: boolean;
  default: boolean;
  identity: boolean;
  mutable: boolean;
  enum: Array<string | number>;
  minimum: number | null;
};
export type Table = {
  name: string;
  pk: string[];
  columns: Column[];
  filters: string[];
};
export type Page = {
  items: Row[];
  next_cursor: string | null;
};
export class AdminFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      signal,
      credentials: "include",
      cache: "no-store",
      headers:
        data === undefined
          ? undefined
          : { "Content-Type": "application/json", "X-Requested-With": "camOS" },
      body: data === undefined ? undefined : stringifyJson(data),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AdminFailure("Couldn't connect. Try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const value = parseJson(await response.text()) as {
    detail?: unknown;
  };
  if (!response.ok)
    throw new AdminFailure(
      typeof value.detail === "string"
        ? value.detail
        : "Unable to complete this request",
      response.status,
    );
  return value as T;
}
export const keyOf = (table: Table, row: Row) =>
  Object.fromEntries(table.pk.map((k) => [k, row[k]]));
export const rowQuery = (table: Table, row: Row) =>
  new URLSearchParams(
    Object.fromEntries(table.pk.map((k) => [k, String(row[k])])),
  ).toString();
export const title = (name: string) =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
