import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const AllocationTag = {
  GenesisNodes: 0,
  Investors: 1,
  Team: 2,
  AirdropLocked: 3,
  Ecosystem: 4,
  Marketing: 5,
  LiquidityProvider: 6,
  CEXAllocation: 7,
  StakingRewards: 8,
} as const;

describe("DefTokenLock", function () {
  async function deployFixture() {
    const [owner, beneficiary, other] = await ethers.getSigners();
    const supply = ethers.parseEther("100000000");
    const token = await ethers.deployContract("MockToken", [
      owner.address,
      supply,
    ]);
    const lock = await ethers.deployContract("DefTokenLock", [
      token.target,
      owner.address,
    ]);
    await token.approve(lock.target, supply);
    return { owner, beneficiary, other, token, lock };
  }

  it("releases linearly vested tokens after the cliff", async function () {
    const { beneficiary, token, lock } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("1000");
    const start = (await time.latest()) + 10;
    const cliff = start + 100;
    const end = start + 1000;
    await expect(
      lock.createAllocation(
        beneficiary.address,
        AllocationTag.Investors,
        amount,
        start,
        cliff,
        end,
      ),
    )
      .to.emit(lock, "AllocationCreated")
      .withArgs(
        0,
        beneficiary.address,
        AllocationTag.Investors,
        amount,
        start,
        cliff,
        end,
      );
    expect((await lock.allocations(0)).tag).to.equal(AllocationTag.Investors);

    await time.setNextBlockTimestamp(start + 500);
    await expect(lock.connect(beneficiary).release(0))
      .to.emit(lock, "TokensReleased")
      .withArgs(0, beneficiary.address, ethers.parseEther("500"));
    expect(await token.balanceOf(beneficiary.address)).to.equal(
      ethers.parseEther("500"),
    );
    expect(await lock.totalReserved()).to.equal(ethers.parseEther("500"));
  });

  it("vests Genesis Nodes 30% over six months and 70% over the following twelve", async function () {
    const { beneficiary, lock } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("50000000");
    const firstPhaseAmount = ethers.parseEther("15000000");
    const secondPhaseAmount = ethers.parseEther("35000000");
    const month = 30 * 24 * 60 * 60;
    const start = (await time.latest()) + 10;
    const end = start + 18 * month;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.GenesisNodes,
      amount,
      start,
      start,
      end,
    );

    expect(await lock.vestedAmount(0, start)).to.equal(0);
    for (let monthIndex = 1; monthIndex <= 6; monthIndex++) {
      expect(await lock.vestedAmount(0, start + monthIndex * month)).to.equal(
        (firstPhaseAmount * BigInt(monthIndex)) / 6n,
      );
    }

    for (let monthIndex = 7; monthIndex <= 17; monthIndex++) {
      expect(await lock.vestedAmount(0, start + monthIndex * month)).to.equal(
        firstPhaseAmount +
          (secondPhaseAmount * BigInt(monthIndex - 6)) / 12n,
      );
    }
    expect(await lock.vestedAmount(0, end)).to.equal(amount);
  });

  it("freezes vesting and refunds only unvested tokens on revocation", async function () {
    const { owner, beneficiary, token, lock } =
      await loadFixture(deployFixture);
    const amount = ethers.parseEther("1000");
    const start = (await time.latest()) + 10;
    const end = start + 1000;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.Team,
      amount,
      start,
      start,
      end,
    );
    const ownerBalanceAfterFunding = await token.balanceOf(owner.address);

    await time.setNextBlockTimestamp(start + 400);
    await expect(lock.revoke(0))
      .to.emit(lock, "AllocationRevoked")
      .withArgs(0, ethers.parseEther("400"), ethers.parseEther("600"));
    expect(await token.balanceOf(owner.address)).to.equal(
      ownerBalanceAfterFunding + ethers.parseEther("600"),
    );

    await time.increaseTo(end + 100);
    expect(await lock.releasableAmount(0)).to.equal(ethers.parseEther("400"));
    await lock.connect(beneficiary).release(0);
    expect(await token.balanceOf(beneficiary.address)).to.equal(
      ethers.parseEther("400"),
    );
    expect(await lock.totalReserved()).to.equal(0);
  });

  it("rejects early and unauthorized releases", async function () {
    const { beneficiary, other, lock } = await loadFixture(deployFixture);
    const start = (await time.latest()) + 10;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.GenesisNodes,
      1000,
      start,
      start + 100,
      start + 1000,
    );

    await expect(lock.connect(other).release(0))
      .to.be.revertedWithCustomError(lock, "NotBeneficiary")
      .withArgs(0);
    await expect(lock.connect(beneficiary).release(0))
      .to.be.revertedWithCustomError(lock, "NothingToRelease")
      .withArgs(0);
  });

  it("accrues from the start and makes the accrued tranche available at the cliff", async function () {
    const { beneficiary, lock } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("1000");
    const start = (await time.latest()) + 10;
    const cliff = start + 250;
    const end = start + 1000;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.AirdropLocked,
      amount,
      start,
      cliff,
      end,
    );

    expect(await lock.vestedAmount(0, cliff - 1)).to.equal(0);
    expect(await lock.vestedAmount(0, cliff)).to.equal(
      ethers.parseEther("250"),
    );
    expect(await lock.vestedAmount(0, end)).to.equal(amount);
  });

  it("releases a fully vested allocation exactly once", async function () {
    const { beneficiary, token, lock } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("1000");
    const start = (await time.latest()) + 10;
    const end = start + 1000;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.Ecosystem,
      amount,
      start,
      start,
      end,
    );

    await time.setNextBlockTimestamp(end);
    await lock.connect(beneficiary).release(0);
    expect(await token.balanceOf(beneficiary.address)).to.equal(amount);
    expect(await lock.totalReserved()).to.equal(0);
    await expect(lock.connect(beneficiary).release(0))
      .to.be.revertedWithCustomError(lock, "NothingToRelease")
      .withArgs(0);
  });

  it("refunds the full allocation when revoked before the cliff", async function () {
    const { owner, beneficiary, token, lock } =
      await loadFixture(deployFixture);
    const amount = ethers.parseEther("1000");
    const start = (await time.latest()) + 100;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.Marketing,
      amount,
      start,
      start + 100,
      start + 1000,
    );
    const fundedBalance = await token.balanceOf(owner.address);

    await expect(lock.revoke(0))
      .to.emit(lock, "AllocationRevoked")
      .withArgs(0, 0, amount);
    expect(await token.balanceOf(owner.address)).to.equal(
      fundedBalance + amount,
    );
    expect(await lock.totalReserved()).to.equal(0);
    await expect(lock.revoke(0))
      .to.be.revertedWithCustomError(lock, "NothingToRevoke")
      .withArgs(0);
  });

  it("tracks aggregate funded obligations across allocations", async function () {
    const { beneficiary, other, token, lock } =
      await loadFixture(deployFixture);
    const firstAmount = ethers.parseEther("1000");
    const secondAmount = ethers.parseEther("250");
    const start = (await time.latest()) + 10;
    const end = start + 1000;
    await lock.createAllocation(
      beneficiary.address,
      AllocationTag.LiquidityProvider,
      firstAmount,
      start,
      start,
      end,
    );
    await lock.createAllocation(
      other.address,
      AllocationTag.CEXAllocation,
      secondAmount,
      start,
      start,
      end,
    );

    expect(await lock.totalReserved()).to.equal(firstAmount + secondAmount);
    expect(await token.balanceOf(lock.target)).to.equal(
      firstAmount + secondAmount,
    );
  });

  it("validates creation and restricts it to the owner", async function () {
    const { beneficiary, other, lock } = await loadFixture(deployFixture);
    const start = (await time.latest()) + 10;

    await expect(
      lock
        .connect(other)
        .createAllocation(
          beneficiary.address,
          AllocationTag.StakingRewards,
          1000,
          start,
          start,
          start + 100,
        ),
    ).to.be.revertedWithCustomError(lock, "OwnableUnauthorizedAccount");
    await expect(
      lock.createAllocation(
        ethers.ZeroAddress,
        AllocationTag.StakingRewards,
        1000,
        start,
        start,
        start + 100,
      ),
    ).to.be.revertedWithCustomError(lock, "InvalidAddress");
    await expect(
      lock.createAllocation(
        beneficiary.address,
        AllocationTag.StakingRewards,
        0,
        start,
        start,
        start + 100,
      ),
    ).to.be.revertedWithCustomError(lock, "InvalidAmount");
    await expect(
      lock.createAllocation(
        beneficiary.address,
        AllocationTag.StakingRewards,
        1000,
        start,
        start - 1,
        start + 100,
      ),
    ).to.be.revertedWithCustomError(lock, "InvalidSchedule");
  });

  it("can recover unrelated tokens but never the configured DEF token", async function () {
    const { owner, other, token, lock } = await loadFixture(deployFixture);
    const otherToken = await ethers.deployContract("MockToken", [
      lock.target,
      1000,
    ]);

    await lock.recoverToken(otherToken.target, other.address, 400);
    expect(await otherToken.balanceOf(other.address)).to.equal(400);
    await expect(
      lock.recoverToken(token.target, owner.address, 1),
    ).to.be.revertedWithCustomError(lock, "InvalidAddress");
  });
});
