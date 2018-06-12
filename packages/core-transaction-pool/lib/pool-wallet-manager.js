'use strict'
const container = require('@arkecosystem/core-container')
const { Wallet } = require('@arkecosystem/crypto').models
const { WalletManager } = require('@arkecosystem/core-database')
const logger = container.resolvePlugin('logger')
const database = container.resolvePlugin('database')
const config = container.resolvePlugin('config')
const { crypto } = require('@arkecosystem/crypto')
const { TRANSACTION_TYPES } = require('@arkecosystem/crypto').constants

module.exports = class PoolWalletManager extends WalletManager {
  /**
   * Create a new pool wallet manager instance.
   * @constructor
   */
  constructor () {
    super()

    this.emitEvents = false
  }

  /**
   * Get a wallet by the given address. If wallet is not found it is copied from blockchain wallet manager
   * Method overrides base class method from WalletManager.
   * @param  {String} address
   * @return {(Wallet|null)}
   */
  getWalletByAddress (address) {
    if (!this.walletsByAddress[address]) {
      const blockchainWallet = database.walletManager.getWalletByAddress(address)
      const wallet = Object.assign(new Wallet(address), blockchainWallet) // do not modify

      this.reindex(wallet)
    }

    return this.walletsByAddress[address]
  }

  /**
   * Checks if wallet exits in pool wallet manager
   * Method overrides base class method from WalletManager.
   * @param  {String} key can be publicKey or address of wallet
   * @return {Boolean} true if exists
   */
  exists (key) {
    if (this.walletsByPublicKey[key]) {
      return true
    }

    if (this.walletsByAddress[key]) {
      return true
    }
    return false
  }

  /**
   * Empty the pool manager wallets
   * @return {void}
   */
  purgeAll () {
    Object.keys(this.walletsByPublicKey).forEach(publicKey => {
      delete this.walletsByPublicKey[publicKey]
    })

    Object.keys(this.walletsByAddress).forEach(address => {
      delete this.walletsByAddress[address]
    })

    Object.keys(this.walletsByUsername).forEach(username => {
      delete this.walletsByUsername[username]
    })
  }

  deleteWallet (publicKey) {
      delete this.walletsByPublicKey[publicKey]

      delete this.walletsByAddress[crypto.getAddress(publicKey, config.network.pubKeyHash)]
  }

  /**
   * Apply the given block to a delegate in the pool wallet manager.
   * We apply only the block reward and fees, as transaction are already be applied
   * when entering the pool. Applying only if delegate wallet is in pool wallet manager
   * Method overrides method from wallet-manager base class
   * @param  {Block} block
   * @return {void}
   */
  applyBlock (block) {
    if (this.exists(block.data.generatorPublicKey)) {
      const delegate = this.getWalletByPublicKey(block.data.generatorPublicKey)
      delegate.applyBlock(block.data)
    }
  }

  /**
   * Apply the given transaction to a delegate.
   * @param  {Transaction} transaction
   * @return {Transaction}
   */
  async applyTransaction (transaction) { /* eslint padded-blocks: "off" */
    const { data } = transaction
    const { type, asset, recipientId, senderPublicKey } = data

    console.log('asset: ', asset)
    if (asset) {
      console.log(database.walletManager.walletsByPublicKey[asset.votes[0].slice(1)])
    }
    const sender = this.getWalletByPublicKey(senderPublicKey)
    let recipient = recipientId ? this.getWalletByAddress(recipientId) : null

    if (!recipient && recipientId) { // cold wallet
      recipient = new Wallet(recipientId)
      this.walletsByAddress[recipientId] = recipient

    } else if (type === TRANSACTION_TYPES.DELEGATE_REGISTRATION && database.walletManager.walletsByPublicKey[asset.delegate.username.toLowerCase()]) {

      logger.error(`Delegate transaction sent by ${sender.address}`, JSON.stringify(data))
      throw new Error(`Can't apply transaction ${data.id}: delegate name already taken`)

    // NOTE: We use the vote public key, because vote transactions have the same sender and recipient
    } else if (type === TRANSACTION_TYPES.VOTE && !database.walletManager.walletsByPublicKey[asset.votes[0].slice(1)]) {

      logger.error(`Vote transaction sent by ${sender.address}`, JSON.stringify(data))
      throw new Error(`Can't apply transaction ${data.id}: voted/unvoted delegate does not exist`)

    } else if (config.network.exceptions[data.id]) {

      logger.warn('Transaction forcibly applied because it has been added as an exception:', data)

    } else if (!sender.canApply(data)) {

      logger.error(`PoolWalletManager: Can't apply transaction for ${sender.address}`, JSON.stringify(data))
      logger.debug('PoolWalletManager: Audit', JSON.stringify(sender.auditApply(data), null, 2))
      throw new Error(`PoolWalletManager: Can't apply transaction ${data.id}`)
    }

    sender.applyTransactionToSender(data)

    if (recipient && type === TRANSACTION_TYPES.TRANSFER) {
      recipient.applyTransactionToRecipient(data)
    }

    return transaction
  }

}
