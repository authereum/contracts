pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../base/Owned.sol";
import "../interfaces/ILoginKeyTransactionValidator.sol";

/**
 * @title AuthereumLoginKeyValidator
 * @author Authereum Labs, Inc.
 * @dev This contract used to validate Login Key transactions. Its address is included in the
 *      loginKeyRestrictionsData that is a part of the data signed for a loginKeyAttestationSignature.
 */

contract AuthereumLoginKeyValidator is Owned, ILoginKeyTransactionValidator {

    /**
     * Events
     */

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    /**
     * State
     */

    mapping(address => bool) public relayerIsWhitelisted;

    string constant public name = "Authereum Login Key Validator";
    string constant public authereumLoginKeyValidatorVersion = "2020033000";

    /// @dev Returns true and an empty string if transactions are valid and false and an error
    ///      message if it's invalid.
    /// @dev validateTransaction MUST return an error message if `success` is `false`
    //  @param _transactions The encoded transactions being executed
    /// @param _validationData The encoded data containing the expiration time
    /// @param _relayerAddress The address calling the account contract
    function validateTransactions(
        bytes[] calldata,
        bytes calldata _validationData,
        address _relayerAddress
    )
        external
    {
        uint256 loginKeyExpirationTime = abi.decode(_validationData, (uint256));

        // Check that loginKey is not expired
        require(loginKeyExpirationTime > now, "LKV: Login key is expired");

        // Check that _relayerAddress is an Authereum relayer
        require(relayerIsWhitelisted[_relayerAddress], "LKV: Invalid relayer");
    }

    /// @dev Called after a transaction is executed to record information about the transaction
    ///      for validation such as value transfered
    //  @param _transactions The encoded transactions being executed
    //  @param _validationData The encoded data containing the expiration time
    //  @param _relayerAddress The address calling the account contract
    function transactionsDidExecute(
        bytes[] calldata,
        bytes calldata,
        address
    )
        external
    { }

    /// @dev Whitelist an array of relayers
    /// @param _newRelayers The list of relayers to be whitelisted
    function addRelayers(address[] calldata _newRelayers) external onlyOwner {
        for (uint256 i = 0; i < _newRelayers.length; i++) {
            address relayer = _newRelayers[i];
            require(relayerIsWhitelisted[relayer] == false, "LKV: Relayer has already been added");
            relayerIsWhitelisted[relayer] = true;
            emit RelayerAdded(relayer);
        }
    }

    /// @dev Remove a relayer from the whitelist
    /// @param _relayersToRemove The list of relayers to remove from the whitelist
    function removeRelayers(address[] calldata _relayersToRemove) external onlyOwner {
        for (uint256 i = 0; i < _relayersToRemove.length; i++) {
            address relayer = _relayersToRemove[i];
            require(relayerIsWhitelisted[relayer] == true, "LKV: Address is not a relayer");
            relayerIsWhitelisted[relayer] = false;
            emit RelayerRemoved(relayer);
        }
    }
}