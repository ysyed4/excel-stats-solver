# Excel Stats Solver

A small web app for solving continuous and discrete probability / statistics problems the same way MMA 863 (and Excel textbooks) do: by looking values up with Excel-style functions such as `BINOM.DIST`, `POISSON.DIST`, `NORM.DIST`, `NORM.S.INV`, and `T.INV`.

Every solution includes a **pedagogical walkthrough** in the course’s six-step style:

1. Determine the distribution  
2. Code what you know  
3. Identify what to find  
4. Sketch a diagram (number line / shaded density / CI bar)  
5. Translate into an Excel-computable form  
6. Solve, check reasonableness, and explain  

It does **not** ask you to plug numbers into closed-form definitional formulas (e.g. the binomial PMF). 

## Features

- **Discrete:** Binomial, Poisson  
- **Continuous:** Uniform (length ratios), Normal, Standard Normal, t  
- **Sampling & inference:** sample mean / proportion probabilities, z and t confidence intervals, sample-size planning  
- Curated example problems from the MMA 863 statistics review deck  
- Shows the Excel-style call used for each answer  

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Stack

- Vite + React + TypeScript  
- [jStat](https://jstat.github.io/) numerical distribution routines behind Excel-named wrappers  

## License

MIT
