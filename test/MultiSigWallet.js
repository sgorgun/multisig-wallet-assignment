const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultiSigWallet", function () {
  let MultiSigWallet;
  let multisig;
  let owner1, owner2, owner3, nonOwner;
  const requiredConfirmations = 2;

  // Deploy a fresh contract before each test
  beforeEach(async function () {
    [owner1, owner2, owner3, nonOwner] = await ethers.getSigners();

    MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multisig = await MultiSigWallet.deploy(
      [owner1.address, owner2.address, owner3.address],
      requiredConfirmations
    );
  });

  /* ============================================================
                      DEPLOYMENT TESTS
     ============================================================ */

  it("should set correct owners and confirmation threshold", async function () {
    expect(await multisig.numConfirmationsRequired()).to.equal(requiredConfirmations);

    const owners = await multisig.getOwners();
    expect(owners).to.deep.equal([
      owner1.address,
      owner2.address,
      owner3.address,
    ]);

    expect(await multisig.isOwner(owner1.address)).to.equal(true);
    expect(await multisig.isOwner(owner2.address)).to.equal(true);
    expect(await multisig.isOwner(owner3.address)).to.equal(true);
  });

  it("should reject deployment with zero owners", async function () {
    const Factory = await ethers.getContractFactory("MultiSigWallet");
    await expect(
      Factory.deploy([], 1)
    ).to.be.revertedWith("Owners required");
  });

  it("should reject invalid confirmation threshold", async function () {
    const Factory = await ethers.getContractFactory("MultiSigWallet");

    // threshold > owners.length
    await expect(
      Factory.deploy([owner1.address, owner2.address], 3)
    ).to.be.revertedWith("Invalid confirmation threshold");

    // threshold == 0
    await expect(
      Factory.deploy([owner1.address, owner2.address], 0)
    ).to.be.revertedWith("Invalid confirmation threshold");
  });

  /* ============================================================
                      SUBMIT TRANSACTION TESTS
     ============================================================ */

  it("should allow owner to submit a transaction", async function () {
    await expect(
      multisig.connect(owner1).submitTransaction(
        owner2.address,
        100,
        "0x"
      )
    )
      .to.emit(multisig, "SubmitTransaction")
      .withArgs(owner1.address, 0, owner2.address, 100, "0x");

    const tx = await multisig.getTransaction(0);
    expect(tx.to).to.equal(owner2.address);
    expect(tx.value).to.equal(100);
    expect(tx.executed).to.equal(false);
    expect(tx.numConfirmations).to.equal(0);
  });

  it("should reject submission from non-owner", async function () {
    await expect(
      multisig.connect(nonOwner).submitTransaction(owner1.address, 100, "0x")
    ).to.be.revertedWith("Not an owner");
  });

  /* ============================================================
                      CONFIRMATION TESTS
     ============================================================ */

  describe("Confirmations", function () {

    beforeEach(async function () {
      // create a transaction at index 0 for confirmation tests
      await multisig.connect(owner1).submitTransaction(owner2.address, 0, "0x");
    });

    it("should allow owner to confirm a transaction", async function () {
      await expect(multisig.connect(owner1).confirmTransaction(0))
        .to.emit(multisig, "ConfirmTransaction")
        .withArgs(owner1.address, 0);

      const tx = await multisig.getTransaction(0);
      expect(tx.numConfirmations).to.equal(1);
    });

    it("should reject duplicate confirmation", async function () {
      await multisig.connect(owner1).confirmTransaction(0);

      await expect(
        multisig.connect(owner1).confirmTransaction(0)
      ).to.be.revertedWith("Transaction already confirmed");
    });

    it("should reject confirmation from non-owner", async function () {
      await expect(
        multisig.connect(nonOwner).confirmTransaction(0)
      ).to.be.revertedWith("Not an owner");
    });
  });

  /* ============================================================
                        REVOCATION TESTS
     ============================================================ */

  describe("Revocation", function () {

    beforeEach(async function () {
      await multisig.connect(owner1).submitTransaction(owner2.address, 0, "0x");
    });

    it("should allow owner to revoke confirmation", async function () {
      await multisig.connect(owner1).confirmTransaction(0);

      await expect(multisig.connect(owner1).revokeConfirmation(0))
        .to.emit(multisig, "RevokeConfirmation")
        .withArgs(owner1.address, 0);

      const tx = await multisig.getTransaction(0);
      expect(tx.numConfirmations).to.equal(0);
    });

    it("should reject revocation if owner has not confirmed", async function () {
      await expect(
        multisig.connect(owner2).revokeConfirmation(0)
      ).to.be.revertedWith("Transaction not confirmed by caller");
    });

  });

  /* ============================================================
                        EXECUTION TESTS
     ============================================================ */

  describe("Execution", function () {

    beforeEach(async function () {
      await multisig.connect(owner1).submitTransaction(owner2.address, 0, "0x");
    });

    it("should execute transaction when enough confirmations are collected", async function () {
      // send ETH to multisig so it has balance
      await owner1.sendTransaction({
        to: multisig.target,
        value: ethers.parseEther("1"),
      });

      await multisig.connect(owner1).confirmTransaction(0);
      await multisig.connect(owner2).confirmTransaction(0);

      await expect(
        multisig.connect(owner1).executeTransaction(0)
      )
        .to.emit(multisig, "ExecuteTransaction")
        .withArgs(owner1.address, 0);

      const tx = await multisig.getTransaction(0);
      expect(tx.executed).to.equal(true);
    });

    it("should reject execution if not enough confirmations", async function () {
      await multisig.connect(owner1).confirmTransaction(0);

      await expect(
        multisig.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("Not enough confirmations");
    });

    it("should reject execution from non-owner", async function () {
      await multisig.connect(owner1).confirmTransaction(0);
      await multisig.connect(owner2).confirmTransaction(0);

      await expect(
        multisig.connect(nonOwner).executeTransaction(0)
      ).to.be.revertedWith("Not an owner");
    });

    it("should reject re-execution of the same transaction", async function () {
      await multisig.connect(owner1).confirmTransaction(0);
      await multisig.connect(owner2).confirmTransaction(0);

      await multisig.connect(owner1).executeTransaction(0);

      await expect(
        multisig.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("Transaction already executed");
    });

  });

});
