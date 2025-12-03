const { ethers } = require("hardhat");

async function main() {
  const [owner1, owner2, owner3] = await ethers.getSigners();

  console.log("Deploying MultiSigWallet...");

  const owners = [owner1.address, owner2.address, owner3.address];
  const confirmationsRequired = 2;

  const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
  const multisig = await MultiSigWallet.deploy(owners, confirmationsRequired);

  console.log("MultiSigWallet deployed to:", multisig.target);
  console.log("Owners:", owners);
  console.log("Confirmations required:", confirmationsRequired);
}

// Hardhat deployment pattern
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
