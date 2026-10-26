/**
 * The one error every M1 engine stub throws until its builder fills the body: `throw notBuilt('heads.headsOn')`.
 * The name is `<file>.<function>`, so a failing fixture test says which body is still missing.
 */
export const notBuilt = (name: string): Error => new Error(`${name} is not built yet`)
