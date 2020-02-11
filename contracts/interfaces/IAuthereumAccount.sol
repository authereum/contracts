pragma solidity 0.5.16;

pragma experimental ABIEncoderV2;

import './IERC721Receiver.sol';
import './IERC1155TokenReceiver.sol';
import './IERC1271.sol';

contract IAuthereumAccount is IERC1271, IERC721Receiver, IERC1155TokenReceiver {

    function () external payable;
    function authereumVersion() external view returns(string memory);
    function getChainId() external pure returns (uint256);
    function addAuthKey(address _authKey) external;
    function removeAuthKey(address _authKey) external;
    function isValidAuthKeySignature(bytes calldata _data, bytes calldata _signature) external view returns (bytes4);
    function isValidLoginKeySignature(bytes calldata _data, bytes calldata _signature) external view returns (bytes4);
    function executeMultipleMetaTransactions(bytes[] calldata _transactions) external returns (bytes[] memory);

    function executeMultipleAuthKeyMetaTransactions(
        bytes[] calldata _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        address _feeTokenAddress,
        uint256 _feeTokenRate,
        bytes calldata _transactionMessageHashSignature
    ) external returns (bytes[] memory);

    function executeMultipleLoginKeyMetaTransactions(
        bytes[] calldata _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        bytes calldata _loginKeyRestrictionsData,
        address _feeTokenAddress,
        uint256 _feeTokenRate,
        bytes calldata _transactionMessageHashSignature,
        bytes calldata _loginKeyAttestationSignature
    ) external returns (bytes[] memory);
}
