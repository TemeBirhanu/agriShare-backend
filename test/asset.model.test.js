import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Asset from "../src/models/Asset.js";

const buildBaseAsset = (overrides = {}) => ({
  farmer: new mongoose.Types.ObjectId(),
  name: "Cattle Asset #1",
  location: {
    kebele: "Kebele 01",
    woreda: "Woreda 01",
    zone: "Zone 01",
    region: "Oromia",
  },
  livestockDetails: {
    sex: "male",
  },
  ...overrides,
});

test("asset defaults to livestock and accepts the minimal cattle shape", () => {
  const asset = new Asset(buildBaseAsset());
  const validationError = asset.validateSync();

  assert.equal(validationError, undefined);
  assert.equal(asset.type, "livestock");
  assert.equal(asset.livestockDetails.sex, "male");
  assert.equal(asset.livestockDetails.breed, undefined);
  assert.equal(asset.livestockDetails.ageYears, undefined);
  assert.equal(asset.livestockDetails.quantity, undefined);
});

test("asset rejects farmland payloads", () => {
  const asset = new Asset(
    buildBaseAsset({
      type: "farmland",
    }),
  );

  const validationError = asset.validateSync();

  assert.ok(validationError);
  assert.ok(validationError.errors.type);
});

test("asset requires cattle sex in livestockDetails", () => {
  const asset = new Asset(
    buildBaseAsset({
      livestockDetails: {},
    }),
  );

  const validationError = asset.validateSync();

  assert.ok(validationError);
  assert.ok(validationError.errors["livestockDetails.sex"]);
});
