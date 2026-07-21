export const botRunner = {
  listForUser(_userId: number) { return [] as any[]; },
  start(_opts: any) {},
  stop(_id: string, _userId: number, _reason: string) {},
  stopAll(_userId: number) { return 0; },
  getStatus(_id: string, _userId: number) { return null; },
};
