// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DEF Token Lock
/// @author DeepSafe
/// @notice Manages funded, revocable linear vesting allocations for DEF tokens.
/// @dev Unvested tokens are refunded on revocation while vested tokens remain claimable.
contract DefTokenLock is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum AllocationTag {
        GenesisNodes,
        Investors,
        Team,
        AirdropLocked,
        Ecosystem,
        Marketing,
        LiquidityProvider,
        CEXAllocation,
        StakingRewards
    }

    struct Allocation {
        address beneficiary;
        AllocationTag tag;
        uint128 amount;
        uint128 released;
        uint64 start;
        uint64 cliff;
        uint64 end;
        uint64 revokedAt;
    }

    uint256 private constant _GENESIS_INITIAL_PERCENT = 30;
    uint256 private constant _PERCENT_DENOMINATOR = 100;

    IERC20 public immutable token;
    uint256 public allocationCount;
    uint256 public totalReserved;
    mapping(uint256 allocationId => Allocation) public allocations;

    event AllocationCreated(
        uint256 indexed allocationId,
        address indexed beneficiary,
        AllocationTag indexed tag,
        uint256 amount,
        uint64 start,
        uint64 cliff,
        uint64 end
    );
    event TokensReleased(
        uint256 indexed allocationId,
        address indexed beneficiary,
        uint256 amount
    );
    event AllocationRevoked(
        uint256 indexed allocationId,
        uint256 vestedAmount,
        uint256 refundedAmount
    );

    error InvalidAddress();
    error InvalidAmount();
    error InvalidSchedule();
    error AllocationNotFound(uint256 allocationId);
    error NotBeneficiary(uint256 allocationId);
    error NothingToRelease(uint256 allocationId);
    error NothingToRevoke(uint256 allocationId);
    error InexactTokenTransfer(uint256 expected, uint256 received);

    /// @notice Deploys a token lock controlled by the initial owner.
    /// @param token_ The configured DEF token, which cannot be recovered through `recoverToken`.
    /// @param initialOwner The address authorized to create and revoke allocations.
    constructor(IERC20 token_, address initialOwner) Ownable(initialOwner) {
        if (address(token_) == address(0) || initialOwner == address(0)) {
            revert InvalidAddress();
        }
        token = token_;
    }

    /// @notice Creates and funds a vesting allocation.
    /// @param beneficiary The address entitled to release vested tokens.
    /// @param tag The category assigned to the allocation.
    /// @param amount The total number of tokens allocated.
    /// @param start The timestamp from which linear vesting accrues.
    /// @param cliff The earliest timestamp at which vested tokens can be released.
    /// @param end The timestamp at which the allocation is fully vested.
    /// @return allocationId The identifier assigned to the allocation.
    function createAllocation(
        address beneficiary,
        AllocationTag tag,
        uint128 amount,
        uint64 start,
        uint64 cliff,
        uint64 end
    ) external onlyOwner nonReentrant returns (uint256 allocationId) {
        if (beneficiary == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (cliff < start || end <= start || cliff > end) {
            revert InvalidSchedule();
        }

        allocationId = allocationCount++;
        allocations[allocationId] = Allocation({
            beneficiary: beneficiary,
            tag: tag,
            amount: amount,
            released: 0,
            start: start,
            cliff: cliff,
            end: end,
            revokedAt: 0
        });
        totalReserved += amount;

        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert InexactTokenTransfer(amount, received);

        emit AllocationCreated({
            allocationId: allocationId,
            beneficiary: beneficiary,
            tag: tag,
            amount: amount,
            start: start,
            cliff: cliff,
            end: end
        });
    }

    /// @notice Releases all currently vested tokens to an allocation's beneficiary.
    /// @param allocationId The allocation to release from.
    function release(uint256 allocationId) external nonReentrant {
        Allocation storage allocation = allocations[allocationId];
        if (allocation.beneficiary == address(0)) {
            revert AllocationNotFound(allocationId);
        }
        if (msg.sender != allocation.beneficiary) {
            revert NotBeneficiary(allocationId);
        }

        uint256 amount =
            vestedAmount(allocationId, uint64(block.timestamp)) -
                allocation.released;
        if (amount == 0) revert NothingToRelease(allocationId);

        allocation.released += uint128(amount);
        totalReserved -= amount;
        token.safeTransfer(allocation.beneficiary, amount);
        emit TokensReleased({
            allocationId: allocationId,
            beneficiary: allocation.beneficiary,
            amount: amount
        });
    }

    /// @notice Stops future vesting and refunds the unvested tokens to the owner.
    /// @param allocationId The allocation to revoke.
    function revoke(uint256 allocationId) external onlyOwner nonReentrant {
        Allocation storage allocation = allocations[allocationId];
        if (allocation.beneficiary == address(0)) {
            revert AllocationNotFound(allocationId);
        }
        if (allocation.revokedAt != 0) revert NothingToRevoke(allocationId);

        uint64 revokedAt = uint64(block.timestamp);
        uint256 vested = vestedAmount(allocationId, revokedAt);
        uint256 refund = uint256(allocation.amount) - vested;
        if (refund == 0) revert NothingToRevoke(allocationId);

        allocation.revokedAt = revokedAt;
        totalReserved -= refund;
        token.safeTransfer(owner(), refund);
        emit AllocationRevoked({
            allocationId: allocationId,
            vestedAmount: vested,
            refundedAmount: refund
        });
    }

    /// @notice Recovers a token other than the configured DEF token.
    /// @param otherToken The unrelated ERC-20 token to recover.
    /// @param recipient The address that receives the recovered tokens.
    /// @param amount The number of tokens to recover.
    function recoverToken(
        IERC20 otherToken,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (address(otherToken) == address(token) || recipient == address(0))
            revert InvalidAddress();
        otherToken.safeTransfer(recipient, amount);
    }

    /// @notice Calculates the amount vested at a timestamp.
    /// @param allocationId The allocation to inspect.
    /// @param timestamp The timestamp used for the vesting calculation.
    /// @return The vested token amount, capped at the allocation's revocation timestamp.
    function vestedAmount(
        uint256 allocationId,
        uint64 timestamp
    ) public view returns (uint256) {
        Allocation memory allocation = _allocation(allocationId);
        uint64 effectiveTimestamp =
            allocation.revokedAt != 0 && timestamp > allocation.revokedAt
                ? allocation.revokedAt
                : timestamp;

        if (effectiveTimestamp < allocation.cliff) return 0;
        if (effectiveTimestamp >= allocation.end) return allocation.amount;
        if (allocation.tag == AllocationTag.GenesisNodes) {
            return _genesisNodesVestedAmount(allocation, effectiveTimestamp);
        }

        return
            (uint256(allocation.amount) *
                (effectiveTimestamp - allocation.start)) /
            (allocation.end - allocation.start);
    }

    /// @notice Calculates the amount currently available for release.
    /// @param allocationId The allocation to inspect.
    /// @return The vested token amount that has not yet been released.
    function releasableAmount(
        uint256 allocationId
    ) public view returns (uint256) {
        Allocation memory allocation = _allocation(allocationId);
        return
            vestedAmount(allocationId, uint64(block.timestamp)) -
            allocation.released;
    }

    function _allocation(
        uint256 allocationId
    ) private view returns (Allocation memory allocation) {
        allocation = allocations[allocationId];
        if (allocation.beneficiary == address(0)) {
            revert AllocationNotFound(allocationId);
        }
    }

    function _genesisNodesVestedAmount(
        Allocation memory allocation,
        uint64 timestamp
    ) private pure returns (uint256) {
        uint256 duration = allocation.end - allocation.start;
        uint256 initialAmount =
            (uint256(allocation.amount) * _GENESIS_INITIAL_PERCENT) /
                _PERCENT_DENOMINATOR;
        uint256 elapsed = timestamp - allocation.start;

        if (elapsed * 3 <= duration) {
            return (initialAmount * elapsed * 3) / duration;
        }

        uint256 remainingAmount = uint256(allocation.amount) - initialAmount;
        return
            initialAmount +
            (remainingAmount * ((elapsed * 3) - duration)) / (duration * 2);
    }
}
