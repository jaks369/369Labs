export async function getPortfolioSnapshot(_userId: number) {
  return { totalEquity: 0, freeBalance: 0, positions: [] };
}
