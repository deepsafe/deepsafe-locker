import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const supply = ethers.parseEther("1000000000");

  const token = await ethers.deployContract("MockToken", [
    deployer.address,
    supply,
  ]);
  await token.waitForDeployment();

  const tokenLock = await ethers.deployContract("DefTokenLock", [
    token.target,
    deployer.address,
  ]);
  await tokenLock.waitForDeployment();

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Mock DEF token: ${token.target}`);
  console.log(`DefTokenLock: ${tokenLock.target}`);
  console.log("\nFrontend environment:");
  console.log(`VITE_LOCK_ADDRESS=${tokenLock.target}`);
  console.log("VITE_CHAIN_ID=31337");
  console.log("VITE_RPC_URL=http://127.0.0.1:8545");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
