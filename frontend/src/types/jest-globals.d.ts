declare const describe: (...args: any[]) => any;
declare const it: (...args: any[]) => any;
declare const test: (...args: any[]) => any;
declare const expect: any;
declare const beforeEach: (...args: any[]) => any;
declare const afterEach: (...args: any[]) => any;
declare const beforeAll: (...args: any[]) => any;
declare const afterAll: (...args: any[]) => any;

declare namespace jest {
  type SpyInstance = {
    mockImplementation: (...args: any[]) => SpyInstance;
    mockReturnValue: (...args: any[]) => SpyInstance;
    mockRestore: () => void;
  } | any;

  function spyOn<T extends object, M extends keyof T>(
    object: T,
    method: M
  ): SpyInstance;
}
