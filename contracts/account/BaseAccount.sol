pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./initializer/AccountInitialize.sol";
import "./state/AccountState.sol";
import "./TokenReceiverHooks.sol";
import "../interfaces/IERC20.sol";
import "../libs/ECDSA.sol";
import "../libs/SafeMath.sol";
import "../libs/BytesLib.sol";

/**
 * @title BaseAccount
 * @author Authereum Labs, Inc.
 * @dev Base account contract. Performs most of the functionality
 * @dev of an Authereum account contract.
 */

contract BaseAccount is AccountState, AccountInitialize, TokenReceiverHooks {
    using SafeMath for uint256;
    using ECDSA for bytes32;
    using BytesLib for bytes;

    // Include a CHAIN_ID const
    uint256 constant private CHAIN_ID = 1;

    modifier onlySelf {
        require(msg.sender == address(this), "BA: Only self allowed");
        _;
    }

    modifier onlyAuthKeySender {
        require(_isValidAuthKey(msg.sender), "BA: Auth key is invalid");
        _;
    }

    modifier onlyAuthKeySenderOrSelf {
        require(_isValidAuthKey(msg.sender) || msg.sender == address(this), "BA: Auth key or self is invalid");
        _;
    }

    // This is required for funds sent to this contract
    function () external payable {}

    /**
     *  Getters
     */

    /// @dev Get the chain ID constant
    /// @return The chain id
    function getChainId() public pure returns (uint256) {
        return CHAIN_ID;
    }

    /**
     *  Public functions
     */

    /// @dev Add an auth key to the list of auth keys
    /// @param _authKey Address of the auth key to add
    function addAuthKey(address _authKey) external onlyAuthKeySenderOrSelf {
        require(authKeys[_authKey] == false, "BA: Auth key already added");
        authKeys[_authKey] = true;
        numAuthKeys += 1;
        emit AuthKeyAdded(_authKey);
    }

    /// @dev Remove an auth key from the list of auth keys
    /// @param _authKey Address of the auth key to remove
    function removeAuthKey(address _authKey) external onlyAuthKeySenderOrSelf {
        require(authKeys[_authKey] == true, "BA: Auth key not yet added");
        require(numAuthKeys > 1, "BA: Cannot remove last auth key");
        authKeys[_authKey] = false;
        numAuthKeys -= 1;
        emit AuthKeyRemoved(_authKey);
    }

    /**
     *  Internal functions
     */

    /// @dev Check if an auth key is valid
    /// @param _authKey Address of the auth key to validate
    /// @return True if the auth key is valid
    function _isValidAuthKey(address _authKey) internal view returns (bool) {
        return authKeys[_authKey];
    }

    /// @dev Execute a transaction without a refund
    /// @notice This is the transaction sent from the CBA
    /// @param _destination Destination of the transaction
    /// @param _value Value of the transaction
    /// @param _gasLimit Gas limit of the transaction
    /// @param _data Data of the transaction
    /// @return Response of the call
    function _executeTransaction(
        address _destination,
        uint256 _value,
        uint256 _gasLimit,
        bytes memory _data
    )
        internal
        returns (bytes memory)
    {
        (bool success, bytes memory res) = _destination.call.gas(_gasLimit).value(_value)(_data);

        // Get the revert message of the call and revert with it if the call failed
        if (!success) {
            string memory _revertMsg = _getRevertMsg(res);
            revert(_revertMsg);
        }

        return res;
    }

    /// @dev Get the revert message from a call
    /// @notice This is needed in order to get the human-readable revert message from a call
    /// @param _res Response of the call
    /// @return Revert message string
    function _getRevertMsg(bytes memory _res) internal pure returns (string memory) {
        // If the _res length is less than 68, then the transaction failed silently (without a revert message)
        if (_res.length < 68) return 'BA: Transaction reverted silently';
        bytes memory revertData = _res.slice(4, _res.length - 4); // Remove the selector which is the first 4 bytes
        return abi.decode(revertData, (string)); // All that remains is the revert string
    }
}