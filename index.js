const FireStoreConnection = require("./lib/connection.js");
const CloudFirestoreAdapterService = require("./lib/service.js");
const NonStandardFilters = ["$startAfter"];

module.exports = { CloudFirestoreAdapterService, FireStoreConnection, NonStandardFilters }