declare module 'jstat' {
  const jStat: {
    binomial: {
      pdf: (k: number, n: number, p: number) => number
      cdf: (k: number, n: number, p: number) => number
    }
    poisson: {
      pdf: (k: number, lambda: number) => number
      cdf: (k: number, lambda: number) => number
    }
    normal: {
      pdf: (x: number, mean: number, std: number) => number
      cdf: (x: number, mean: number, std: number) => number
      inv: (p: number, mean: number, std: number) => number
    }
    studentt: {
      pdf: (x: number, df: number) => number
      cdf: (x: number, df: number) => number
      inv: (p: number, df: number) => number
    }
    jStat: typeof jStat
  }
  export default jStat
}
