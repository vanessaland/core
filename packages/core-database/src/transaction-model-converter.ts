import { CryptoSuite } from "@arkecosystem/core-crypto";
import { Container, Contracts } from "@arkecosystem/core-kernel";
import { Interfaces } from "@arkecosystem/crypto";

import { Transaction } from "./models/transaction";

@Container.injectable()
export class TransactionModelConverter implements Contracts.Database.TransactionModelConverter {
    @Container.inject(Container.Identifiers.TransactionManager)
    private readonly transactionsManager!: CryptoSuite.TransactionManager;

    public getTransactionModel(transaction: Interfaces.ITransaction): Contracts.Database.TransactionModel {
        return Object.assign(new Transaction(), transaction.data, {
            timestamp: transaction.timestamp,
            serialized: transaction.serialized,
        });
    }

    public getTransactionData(model: Contracts.Database.TransactionModel): Interfaces.ITransactionData {
        const data = this.transactionsManager.TransactionFactory.fromBytesUnsafe(model.serialized, model.id).data;

        // set_row_nonce trigger
        data.nonce = model.nonce;

        // block constructor
        data.blockId = model.blockId;
        data.sequence = model.sequence;

        return data;
    }
}
