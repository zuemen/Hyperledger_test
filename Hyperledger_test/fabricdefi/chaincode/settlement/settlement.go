package main

import (
	"encoding/json"
	"fmt"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SettlementContract provides functions for cross-organization settlement
type SettlementContract struct {
	contractapi.Contract
}

// Settlement represents a settlement request
type Settlement struct {
	ID      string `json:"id"`
	FromOrg string `json:"from_org"`
	ToOrg   string `json:"to_org"`
	Amount  string `json:"amount"`
	Status  string `json:"status"` // PENDING, APPROVED
}

// RequestSettlement initiates a settlement request
func (s *SettlementContract) RequestSettlement(ctx contractapi.TransactionContextInterface, fromOrg string, toOrg string, amount string) (string, error) {
	txID := ctx.GetStub().GetTxID()
	settlement := Settlement{
		ID:      txID,
		FromOrg: fromOrg,
		ToOrg:   toOrg,
		Amount:  amount,
		Status:  "PENDING",
	}

	settlementBytes, err := json.Marshal(settlement)
	if err != nil {
		return "", err
	}

	err = ctx.GetStub().PutState("settlement_"+txID, settlementBytes)
	if err != nil {
		return "", err
	}

	return txID, nil
}

// ApproveSettlement approves the settlement and performs the transfer
func (s *SettlementContract) ApproveSettlement(ctx contractapi.TransactionContextInterface, settlementID string) error {
	settlementBytes, err := ctx.GetStub().GetState("settlement_" + settlementID)
	if err != nil {
		return fmt.Errorf("failed to read settlement: %v", err)
	}
	if settlementBytes == nil {
		return fmt.Errorf("settlement %s does not exist", settlementID)
	}

	var settlement Settlement
	err = json.Unmarshal(settlementBytes, &settlement)
	if err != nil {
		return err
	}

	if settlement.Status != "PENDING" {
		return fmt.Errorf("settlement is already %s", settlement.Status)
	}

	// Call token chaincode to transfer
	response := ctx.GetStub().InvokeChaincode("token", [][]byte{[]byte("Transfer"), []byte(settlement.FromOrg), []byte(settlement.ToOrg), []byte(settlement.Amount)}, "")
	if response.Status != 200 {
		return fmt.Errorf("failed to transfer tokens during settlement: %s", response.Message)
	}

	settlement.Status = "APPROVED"
	updatedBytes, err := json.Marshal(settlement)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState("settlement_"+settlementID, updatedBytes)
}

// GetPendingSettlements returns all pending settlements
func (s *SettlementContract) GetPendingSettlements(ctx contractapi.TransactionContextInterface) ([]*Settlement, error) {
	// Using a simple prefix query for "settlement_"
	resultsIterator, err := ctx.GetStub().GetStateByRange("settlement_", "settlement_~")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var settlements []*Settlement
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var settlement Settlement
		err = json.Unmarshal(queryResponse.Value, &settlement)
		if err != nil {
			return nil, err
		}

		if settlement.Status == "PENDING" {
			settlements = append(settlements, &settlement)
		}
	}

	return settlements, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&SettlementContract{})
	if err != nil {
		fmt.Printf("Error create settlement chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting settlement chaincode: %s", err.Error())
	}
}
