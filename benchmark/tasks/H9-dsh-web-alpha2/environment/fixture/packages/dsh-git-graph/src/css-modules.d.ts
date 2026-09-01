/** CSS Modules typing for the client bundle (hashed class maps). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
