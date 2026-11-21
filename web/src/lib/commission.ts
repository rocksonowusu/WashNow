/**
 * What each washer earns from a sale, worked out exactly as the server does
 * (api/app/Services/SaleService.php, splitCommission): the sale is shared
 * equally between its washers, spare pesewas go to the first washers, and
 * each washer earns their own percentage of their share, rounded to the
 * nearest pesewa. Used to show the split live before the sale is saved.
 *
 * @param amount  the sale, in pesewas
 * @param percents each washer's commission rate, e.g. "30.00"; null counts as 0
 */
export function splitCommission(amount: number, percents: (string | number | null)[]): number[] {
  const count = percents.length
  if (count === 0 || amount <= 0) return percents.map(() => 0)

  return percents.map((percent, index) => {
    const share = Math.floor(amount / count) + (index < amount % count ? 1 : 0)
    const basisPoints = Math.round(Number(percent ?? 0) * 100)
    return Math.floor((share * basisPoints + 5000) / 10000)
  })
}
