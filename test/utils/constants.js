module.exports = {
  // ETH Values
  ONE_ETHER: web3.utils.toWei('1', 'ether'),
  TWO_ETHER: web3.utils.toWei('2', 'ether'),
  THREE_ETHER: web3.utils.toWei('3', 'ether'),
  TEN_ETHER: web3.utils.toWei('10', 'ether'),
  TWENTY_ETHER: web3.utils.toWei('20', 'ether'),
  STARTING_ETHER: web3.utils.toWei('1000000000000000000', 'ether'),

  // TX Data
  GAS_PRICE: 20000000000,
  GAS_LIMIT: 500000,
  CHAIN_ID: 1,
  DATA: '0x00',

  // Signing Data
  AUTH_KEY_0_PRIV_KEY: '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1',
  LOGIN_KEY_0_PRIV_KEY: '0x77c5495fbb039eed474fc940f29955ed0531693cc9212911efd35dff0373153f',

  // Timing
  ONE_DAY: 86400,
  ONE_WEEK: 86400 * 7,
  ONE_MONTH: 86400 * 7 * 4,

  // Other
  HASH_ZERO: '0x0000000000000000000000000000000000000000000000000000000000000000',
  BAD_DATA: '0xe855bd76',
};