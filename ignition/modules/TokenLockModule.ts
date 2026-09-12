import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TokenLockModule", (module) => {
  const token = module.getParameter("token");
  const initialOwner = module.getParameter("initialOwner");
  const tokenLock = module.contract("DefTokenLock", [token, initialOwner]);
  return { tokenLock };
});
