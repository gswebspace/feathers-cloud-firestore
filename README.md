# About
feathers-cloud-firestore is a feathers database adapter using Cloud Firestore Node.js Server SDK. It makes it easier to implement CRUD functionality using a feathers service with Cloud Firestore.

Each service is linked to a [CollectionReference](https://googleapis.dev/nodejs/firestore/latest/CollectionReference.html).

Note: This package is currently under development. If you see any issues feel free to open an issue or submit a PR.

# Installation
- Install the package using npm 
    
    `npm install feathers-cloud-firestore`

- Modify your app.js 

    ```
    const { FireStoreConnection } = require("feathers-cloud-firestore");
    .
    .
    .
    // Configure cloud firestore
    let firestoreConnection = new FireStoreConnection({
        keyFilename: "secrets/firebasekey.json"
    })
    app.set("firestoreConnection", firestoreConnection)
    .
    .
    .
    ```
- Modify your service.js
    
    ```
    // Initializes the `snippets` service on path `/snippets`
    const { CloudFirestoreAdapterService, NonStandardFilters } = require("feathers-cloud-firestore");
    const hooks = require('./snippets.hooks');

    module.exports = function (app) {
        const options = {
            paginate: app.get('paginate'),
            multi: false,
            Model: (params)=>{
                let fsConn = app.get('firestoreConnection');
                let firestore = fsConn.firestore;
                return firestore.collection("snippets");
            },
            whitelist: NonStandardFilters
        };

        // Initialize our service with any options it requires
        app.use('/snippets', new CloudFirestoreAdapterService(options, app));

        // Get our initialized service so that we can register hooks
        const service = app.service('snippets');
        service.hooks(hooks);
    };
    ```
# Known Limitations
- Firebase authentication is not supported. This adapter is meant to be used server-side.
- The Model used by a service can only be linked to a [`CollectionReference`](https://googleapis.dev/nodejs/firestore/latest/CollectionReference.html).
- Pagination is not supported as described by the [Common API](https://docs.feathersjs.com/api/databases/common.html#pagination) due to the added cost of returning `total` key. A combination of `limit` and `startAfter` is used instead by default.
- Dates are converted to milliseconds in responses
- Document references are converted to `path` strings in responses
- Range queries on multiple keys are not supported due the [inherent limitation](https://firebase.google.com/docs/firestore/query-data/queries#query_limitations).
- More than 10 values are not supported in $in
- $nin and $ne are not supported
- $or is not yet implemented