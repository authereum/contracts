pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import "../libs/SafeMath.sol";
import "../interfaces/IAuthereumAccount.sol";

/**
 * @title AuthereumRecoveryModule
 * @author Authereum Labs, Inc.
 * @dev This contract facilitates the recovery of Authereum accounts.
 * @dev This contract may be added as a module for an Authereum account. The Authereum
 * @dev account may set one or more recovery addresses and specify a recovery delay period.
 * @dev A recovery address may start the recovery process at any time and specify a new auth
 * @dev key to be added to the Authereum account. During the recovery delay period, the
 * @dev recovery process can be cancelled by the Authereum account. After the recovery delay
 * @dev period, any address can complete the recovery process which will add the new auth key
 * @dev to the Authereum account.
 */

contract AuthereumRecoveryModule {
    using SafeMath for uint256;

    string constant public name = "Authereum Recovery Module";
    string constant public version = "2020070100";

    /**
     * Events
     */

    event RecoveryAddressAdded (
        address indexed accountContract,
        address indexed recoveryAddress,
        uint256 indexed recoveryDelay
    );

    event RecoveryAddressRemoved (
        address indexed accountContract,
        address indexed recoveryAddress
    );

    event RecoveryStarted (
        address indexed accountContract,
        address indexed recoveryAddress,
        address indexed newAuthKey,
        uint256 startTime,
        uint256 recoveryDelay
    );

    event RecoveryCancelled (
        address indexed accountContract,
        address indexed recoveryAddress,
        address indexed newAuthKey
    );

    event RecoveryCompleted (
        address indexed accountContract,
        address indexed recoveryAddress,
        address indexed newAuthKey
    );

    /**
     * State
     */

    struct RecoveryAccount {
        bool active;
        uint256 delay;
    }

    struct RecoveryAttempt {
        uint256 startTime;
        address newAuthKey;
    }

    mapping(address => mapping(address => RecoveryAccount)) public recoveryAccounts;
    mapping(address => mapping(address => RecoveryAttempt)) public recoveryAttempts;

    /**
     * Modifiers
     */

    modifier isRecoveryAddress(address _accountContract, address _recoveryAddress) {
        require(recoveryAccounts[_accountContract][_recoveryAddress].active, "ARM: Inactive recovery account");
        _;
    }

    modifier onlyWhenRegisteredModule {
        require(IAuthereumAccount(msg.sender).authKeys(address(this)), "ARM: Recovery module not registered to account");
        _;
    }

    /**
     *  Public functions
     */

    /// @dev Add a recovery address
    /// @dev Called by the Authereum account
    /// @param _recoveryAddress The address that can recover the account
    /// @param _recoveryDelay The delay required between starting and completing recovery
    function addRecoveryAccount(address _recoveryAddress, uint256 _recoveryDelay) external onlyWhenRegisteredModule {
        require(_recoveryAddress != address(0), "ARM: Recovery address cannot be address(0)");
        require(_recoveryAddress != msg.sender, "ARM: Cannot add self as recovery account");
        require(recoveryAccounts[msg.sender][_recoveryAddress].active == false, "ARM: Recovery address has already been added");
        recoveryAccounts[msg.sender][_recoveryAddress] = RecoveryAccount(true, _recoveryDelay);

        emit RecoveryAddressAdded(msg.sender, _recoveryAddress, _recoveryDelay);
    }

    /// @dev Remove a recovery address
    /// @dev Called by the Authereum account
    /// @param _recoveryAddress The address that can recover the account
    function removeRecoveryAccount(address _recoveryAddress) external {
        require(recoveryAccounts[msg.sender][_recoveryAddress].active == true, "ARM: Recovery address is already inactive");
        delete recoveryAccounts[msg.sender][_recoveryAddress];

        RecoveryAttempt storage recoveryAttempt = recoveryAttempts[msg.sender][_recoveryAddress];
        if (recoveryAttempt.startTime != 0) {
            emit RecoveryCancelled(msg.sender, _recoveryAddress, recoveryAttempt.newAuthKey);
        }
        delete recoveryAttempts[msg.sender][_recoveryAddress];

        emit RecoveryAddressRemoved(msg.sender, _recoveryAddress);
    }

    /// @dev Start the recovery process
    /// @dev Called by the recovery address
    /// @param _accountContract Address of the Authereum account being recovered
    /// @param _newAuthKey The address of the Auth Key being added to the Authereum account
    function startRecovery(address _accountContract, address _newAuthKey) external isRecoveryAddress(_accountContract, msg.sender) {
        require(recoveryAttempts[_accountContract][msg.sender].startTime == 0, "ARM: Recovery is already in process");
        require(_newAuthKey != address(0), "ARM: Auth Key cannot be address(0)");

        recoveryAttempts[_accountContract][msg.sender] = RecoveryAttempt(now, _newAuthKey);

        uint256 recoveryDelay = recoveryAccounts[_accountContract][msg.sender].delay;
        emit RecoveryStarted(_accountContract, msg.sender, _newAuthKey, now, recoveryDelay);
    }

    /// @dev Cancel the recovery process
    /// @dev Called by the recovery address
    /// @param _accountContract Address of the Authereum account being recovered
    function cancelRecovery(address _accountContract) external isRecoveryAddress(_accountContract, msg.sender) {
        RecoveryAttempt memory recoveryAttempt = recoveryAttempts[_accountContract][msg.sender];

        require(recoveryAttempt.startTime != 0, "ARM: Recovery attempt does not exist");

        delete recoveryAttempts[_accountContract][msg.sender];

        emit RecoveryCancelled(_accountContract, msg.sender, recoveryAttempt.newAuthKey);
    }

    /// @dev Complete the recovery process
    /// @dev Called by any address
    /// @param _accountContract Address of the Authereum account being recovered
    /// @param _recoveryAddress The address that can recover the account
    function completeRecovery(address payable _accountContract, address _recoveryAddress) external isRecoveryAddress(_accountContract, _recoveryAddress) {
        RecoveryAccount memory recoveryAccount = recoveryAccounts[_accountContract][_recoveryAddress];
        RecoveryAttempt memory recoveryAttempt = recoveryAttempts[_accountContract][_recoveryAddress];

        require(recoveryAttempt.startTime != 0, "ARM: Recovery attempt does not exist");
        require(recoveryAttempt.startTime.add(recoveryAccount.delay) <= now, "ARM: Recovery attempt delay period has not completed");

        delete recoveryAttempts[_accountContract][_recoveryAddress];
        IAuthereumAccount(_accountContract).addAuthKey(recoveryAttempt.newAuthKey);

        emit RecoveryCompleted(_accountContract, _recoveryAddress, recoveryAttempt.newAuthKey);
    }
}
