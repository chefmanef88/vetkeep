/**
 * Image imports.
 *
 * Metro resolves `import photo from "./photo.jpg"` to the number that
 * `Image source` expects, but TypeScript has no idea what a .jpg module is —
 * expo/types does not declare one. Without this, the only way to load an asset
 * that typechecks is `require()`, which this project's lint rule forbids, and
 * the two rules together leave no legal way to put a photograph on a screen.
 *
 * Typed as `number` rather than `any` because that is what the bundler actually
 * produces: an opaque handle into the asset registry, which is only ever passed
 * to `source`, never read.
 */
declare module "*.jpg" {
  const asset: number;
  export default asset;
}

declare module "*.jpeg" {
  const asset: number;
  export default asset;
}

declare module "*.png" {
  const asset: number;
  export default asset;
}
