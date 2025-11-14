declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export interface ReactTestRendererTree {
    type: string | null;
    props: Record<string, unknown>;
    children: ReactTestRendererNode[];
  }

  export type ReactTestRendererNode = ReactTestRendererTree | string;

  export interface ReactTestRendererJSON {
    type: string;
    props: Record<string, unknown>;
    children: ReactTestRendererJSON[] | string[];
  }

  export interface TestRenderer {
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null;
    update(element: ReactElement): void;
    unmount(nextElement?: ReactElement): void;
    root: unknown;
  }

  export function create(
    element: ReactElement,
    options?: {
      createNodeMock?: (element: ReactElement) => unknown;
    }
  ): TestRenderer;
}
