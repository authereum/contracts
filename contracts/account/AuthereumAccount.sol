pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./BaseAccount.sol";
import "./ERC1271Account.sol";
import "./LoginKeyMetaTxAccount.sol";
import "./AuthKeyMetaTxAccount.sol";
import "./AccountUpgradeability.sol";
import "../interfaces/IAuthereumAccount.sol";

/**
 * @title AuthereumAccount
 * @author Authereum Labs, Inc.
 * @dev Top-level contract used when creating an Authereum account.
 * @dev This contract is meant to only hold the version. All other logic is inherited.
 */

contract AuthereumAccount is
    IAuthereumAccount,
    BaseAccount,
    ERC1271Account,
    LoginKeyMetaTxAccount,
    AuthKeyMetaTxAccount,
    AccountUpgradeability
{
    string constant public authereumVersion = "2020021700";
}
