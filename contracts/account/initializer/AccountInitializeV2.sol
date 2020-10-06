pragma solidity 0.5.17;

import "../state/AccountState.sol";
import "../../interfaces/IERC20.sol";

/**
 * @title AccountInitializeV2
 * @author Authereum Labs, Inc.
 * @dev This contract holds the initialize function used by the account contracts.
 * @dev This abstraction exists in order to retain the order of the initialization functions.
 */

contract AccountInitializeV2 is AccountState {

    /// @dev Add the ability to refund the contract for a deployment
    /// @param _deploymentCost Cost of the deployment
    /// @param _deploymentFeeTokenAddress Address of the token used to pay a deployment fee
    function initializeV2(
        uint256 _deploymentCost,
        address _deploymentFeeTokenAddress
    )
        public
    {
        require(lastInitializedVersion == 1, "AI2: Improper initialization order");
        lastInitializedVersion = 2;

        if (_deploymentCost != 0) {
            if (_deploymentFeeTokenAddress == address(0)) {
                uint256 amountToTransfer = _deploymentCost < address(this).balance ? _deploymentCost : address(this).balance;
                tx.origin.transfer(amountToTransfer);
            } else {
                IERC20 deploymentFeeToken = IERC20(_deploymentFeeTokenAddress);
                uint256 userBalanceOf = deploymentFeeToken.balanceOf(address(this));
                uint256 amountToTransfer = _deploymentCost < userBalanceOf ? _deploymentCost : userBalanceOf;
                deploymentFeeToken.transfer(tx.origin, amountToTransfer);
            }
        }
    }
} 