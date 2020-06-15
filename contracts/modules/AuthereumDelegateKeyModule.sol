pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import "../account/AuthereumAccount.sol";
import "../libs/BytesLib.sol";
import "../libs/SafeMath.sol";
import "../utils/ReentrancyGuard.sol";

/**
 * @title AuthereumDelegateKeyModule
 * @author Authereum Labs, Inc.
 * @dev This contract allows specific transactions to be delegated to a third party key
 * @dev This contract may be added as a module for an Authereum account. The Authereum account can
 *      register a third party key to call a specific function signature on a specific address with a
 *      maximum amount of ETH included with the transaction. Once added, the Delegate Key can call
 *      its specified function an unlimited amount of times until it is removed.
 * @notice The AuthereumDelegateKeyModule does not enforce that the length of _lockedParameters and
 *         _lockedParameterValues are equal to the actual number of parameters taken by the
 *         function being registered. In addition, dynamically-sized parameters cannot be locked
 *         but this is not enforced on-chain. When registering a Delegate Key, care should be taken
 *         to ensure that _lockedParameters and _lockedParameterValues equal the number of
 *         parameters in the function being registered and that none of the parameters being locked
 *         are dynamically-sized.
 */

contract AuthereumDelegateKeyModule is ReentrancyGuard {
    using SafeMath for uint256;
    using BytesLib for bytes;

    /**
     * Events
     */

    event DelegateKeyAdded(
        address indexed authereumAccount,
        address indexed delegateKeyAddress,
        bytes4 approvedFunctionSelector,
        address indexed approvedDestination,
        uint256 maxValue
    );

    event DelegateKeyRemoved(
        address indexed authereumAccount,
        address indexed delegateKeyAddress
    );

    event TransactionExecuted(
        address indexed authereumAccount,
        address indexed delegateKey,
        uint256 indexed value,
        bytes data
    );

    /**
     * State
     */

    struct DelegateKey {
        bool active;
        bytes4 approvedFunctionSelector;
        address approvedDestination;
        uint256 maxValue;
        bool[] lockedParameters;
        bytes32[] lockedParameterValues;
    }

    string constant public name = "Authereum Delegate Key Module";
    string constant public authereumDelegateKeyModuleVersion = "2020042500";

    mapping(address => mapping(address => DelegateKey)) public delegateKeys;

    /**
     * Modifiers
     */

    modifier onlyActiveDelegateKey(address _authereumAccount) {
        DelegateKey memory delegateKey = delegateKeys[_authereumAccount][msg.sender];
        require(delegateKey.active == true, "DKM: Delegate Key is not active");
        _;
    }

    modifier onlyWhenRegisteredModule {
        require(
            AuthereumAccount(msg.sender).authKeys(address(this)),
            "DKM: Delegate Key module not registered to account"
        );
        _;
    }

    /**
     * Public functions
     */

    /// @dev Adds a Delegate Key
    /// @dev Called by the Authereum account
    /// @dev The length of _lockedParameters  and _lockedParameterValues should equal the number of
    ///      parameters in the approved function signature.
    /// @dev Dynamic parameters cannot be locked
    /// @param _delegateKeyAddress Address of the Delegate Key
    /// @param _approvedFunctionSelector The function selector that the Delegate Key can call on the
    ///        approved contract
    /// @param _approvedDestination The address that the Delegate Key can call
    /// @param _maxValue The maximum value that can be transferred in each transaction
    /// @param _lockedParameters An array of booleans specifying which parameters should be locked
    /// @param _lockedParameterValues An array of values that locked parameters should be locked to
    function addDelegateKey(
        address _delegateKeyAddress,
        bytes4 _approvedFunctionSelector,
        address _approvedDestination,
        uint256 _maxValue,
        bool[] calldata _lockedParameters,
        bytes32[] calldata _lockedParameterValues
    )
        external
        onlyWhenRegisteredModule
    {
        require(_delegateKeyAddress != address(0), "DKM: Delegate Key cannot be address(0)");
        require(delegateKeys[msg.sender][_delegateKeyAddress].active != true, "DKM: Delegate Key is already registered");
        require(
            _lockedParameters.length == _lockedParameterValues.length,
            "DKM: lockedParameters must be the same length as lockedParameterValues"
        );

        delegateKeys[msg.sender][_delegateKeyAddress] = DelegateKey(
            true,
            _approvedFunctionSelector,
            _approvedDestination,
            _maxValue,
            _lockedParameters,
            _lockedParameterValues
        );

        emit DelegateKeyAdded(
            msg.sender,
            _delegateKeyAddress,
            _approvedFunctionSelector,
            _approvedDestination,
            _maxValue
        );
    }

    /// @dev Removes the Delegate Key
    /// @dev Called by the Authereum account
    /// @param _delegateKeyAddress Address of the Delegate Key
    function removeDelegateKey(address _delegateKeyAddress) external {
        DelegateKey memory delegateKey = delegateKeys[msg.sender][_delegateKeyAddress];
        require(delegateKey.active == true, "DKM: Delegate Key is not active");
        
        delete delegateKeys[msg.sender][_delegateKeyAddress];
        
        emit DelegateKeyRemoved(msg.sender, _delegateKeyAddress);
    }

    /// @dev Validates and then exectutes a transaction with the Authereum account
    /// @dev Called by the Delegate Key
    /// @param _authereumAccount Address of the Authereum account that the Delegate Key is making
    ///        a transaction for
    /// @param _value Value of the transaction
    /// @param _data The calldata of the transaction made by the Authereum account
    /// @return Return values of the executed transaction
    function executeTransaction(
        address payable _authereumAccount,
        uint256 _value,
        bytes calldata _data
    )
        external
        nonReentrant
        onlyActiveDelegateKey(_authereumAccount)
        returns (bytes[] memory)
    {
        DelegateKey memory delegateKey = delegateKeys[_authereumAccount][msg.sender];

        // Validate value
        require(_value <= delegateKey.maxValue, "DKM: Value is higher than maximum allowed value");

        _validateCalldata(delegateKey, _data);

        return _executeTransaction(
            _authereumAccount,
            delegateKey.approvedDestination,
            _value,
            gasleft(),
            _data
        );
    }

    /**
     * Private functions
     */

    function _validateCalldata(DelegateKey memory _delegateKey, bytes memory _data) private pure {
        // If approvedFunctionSelector is 0x, no data can be included
        if (_delegateKey.approvedFunctionSelector == bytes4(0)) {
            require(_data.length == 0);
            return;
        }

        bool[] memory lockedParameters = _delegateKey.lockedParameters;
        bytes32[] memory lockedParameterValues = _delegateKey.lockedParameterValues;
        (bytes4 functionSelector, bytes32[] memory parameters) = _parseCalldata(_data, lockedParameters.length);

        // Validate functionSelector
        require(
            functionSelector == _delegateKey.approvedFunctionSelector,
            "DKM: Invalid function selector"
        );

        // Validate locked values
        for (uint256 i = 0; i < lockedParameters.length; i++) {
            if (lockedParameters[i]) {
                require(lockedParameterValues[i] == parameters[i], "DKM: Invalid parameter");
            }
        }
    }

    function _parseCalldata(
        bytes memory _data,
        uint256 _parameterCount
    )
        internal
        pure
        returns (bytes4, bytes32[] memory)
    {
        // NOTE: This function does not handle fallbacks, as those are handled one level above

        // Minimum data length is 4 bytes for the function selector + 32 bytes per parameter
        uint256 minDataLength = _parameterCount.mul(32).add(4);
        require(_data.length >= minDataLength, "DKM: Transaction data is too short");

        bytes4 functionSelector = _data.toBytes4(0);
        bytes32[] memory parameters = new bytes32[](_parameterCount);
        for (uint256 i = 0; i < _parameterCount; i++) {
            // Parameters are every 32 bytes after the 4 byte function selector
            parameters[i] = _data.toBytes32(i.mul(32).add(4));
        }

        return (functionSelector, parameters);
    }

    function _executeTransaction(
        address payable _authereumAccount,
        address _to,
        uint256 _value,
        uint256 _gasLimit,
        bytes memory _data
    )
        private
        returns (bytes[] memory)
    {
        // Prepare transactions
        bytes memory transactionData = abi.encode(_to, _value, _gasLimit, _data);
        bytes[] memory transactions = new bytes[](1);
        transactions[0] = transactionData;

        // Make the transaction
        bytes[] memory returnValues = AuthereumAccount(_authereumAccount).executeMultipleMetaTransactions(transactions);

        emit TransactionExecuted(_authereumAccount, msg.sender, _value, _data);
        return returnValues;
    }
}
