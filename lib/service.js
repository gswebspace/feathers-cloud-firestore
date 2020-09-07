const { AdapterService, select } = require('@feathersjs/adapter-commons');
const { BadRequest, NotFound } = require('@feathersjs/errors');
const { DocumentReference, Timestamp, CollectionReference } = require('@google-cloud/firestore');

class Service extends AdapterService {

  constructor(options) {
    if (!options) {
      throw new Error('Cloud Firestore options have to be provided');
    }

    if (options.multi === true) {
      throw new Error("multi option is not yet supported by service")
    }

    super(Object.assign({
      id: "id"
    }, options));
  }

  get Model() {
    return this.options.Model;
  }

  set Model(value) {
    this.options.Model = value;
  }

  _getCloudFirestoreRef(params) {
    //TODO: Check if model provided is a CollectionReference
    let model;
    if (typeof this.Model === "function") {
      model = this.Model(params);
    } else {
      model = this.Model;
    }

    if (!(model instanceof CollectionReference)) {
      throw new Error("Invalid Model")
    } else {
      return model;
    }
  }

  _normalizeData(data) {
    let res = {};
    if (data && typeof data === "object") {
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          const val = data[key];

          if (val instanceof DocumentReference) {
            res[key] = val.path;
          } else if (val instanceof Timestamp) {
            res[key] = val.toMillis();
          } else {
            res[key] = val;
          }

        }
      }

      return res;
    } else {
      return data;
    }

  }

  _mergeDataAndId(id, data) {
    return { id, ...data };
  }

  async _find(params = {}) {

    //Obtain the Model to work on
    let ref = this._getCloudFirestoreRef(params);

    //Split params to different kinds of operations
    const { filters, query, paginate } = this.filterQuery(params);
    let nonStandardFilters = ["$startAfter"];
    for (const nsf of nonStandardFilters) {
      if (query[nsf]) {
        filters[nsf] = query[nsf];
        delete query[nsf];
      }
    }

    //Apply query 
    let equalityFields = {};
    let finalQuery = undefined;
    for (const key in query) {
      if (query.hasOwnProperty(key)) {
        const queryValue = query[key];

        //Check if Equality or $ operator
        if (typeof queryValue !== queryValue) {
          //Equality
          equalityFields[key] = true;
          if (!finalQuery) {
            finalQuery = ref.where(key, '==', queryValue);
          } else {
            finalQuery = finalQuery.where(key, '==', queryValue);
          }
        } else {
          //Check supported $ operators
        }
      }
    }

    //Apply filters
    let sortBy = null;
    let sortOrder = null
    if (filters.$sort) {

      //Check if only 1 key is used for sorting
      if (Object.keys(filters.$sort).length !== 1) {
        throw new BadRequest("Sorting on multiple keys is not supported")
      }

      sortBy = Object.keys(filters.$sort)[0];
      if (sortBy === "id") {
        throw new BadRequest("Sorting by id is not supported")
      }

      if (filters.$sort[sortBy] === -1) {
        sortOrder = 'desc';
      } else {
        sortOrder = 'asc';
      }

      if (!finalQuery) {
        finalQuery = ref.orderBy(sortBy, sortOrder);
      } else {
        finalQuery = finalQuery.orderBy(sortBy, sortOrder);
      }
    }

    let startAfter = filters.$startAfter || null;
    if (startAfter !== null) {
      const docRef = ref.doc(startAfter);
      const snapshot = await docRef.get();
      if (snapshot.exists !== true) {
        throw new NotFound("Document referred by $startAfter is not available")
      }
      if (!finalQuery) {
        finalQuery = ref.startAfter(snapshot);
      } else {
        finalQuery = finalQuery.startAfter(snapshot);
      }
    }

    //Limit query by default
    let limit = filters.$limit || paginate.default || 10;
    if (limit) {
      if (!finalQuery) {
        finalQuery = ref.limit(limit);
      } else {
        finalQuery = finalQuery.limit(limit);
      }
    }

    //Fetch data
    let fetchedDocs = [];
    let querySnapshot = undefined;
    if (finalQuery) {
      querySnapshot = await finalQuery.get();
    } else {
      querySnapshot = await ref.get();
    }
    querySnapshot.forEach((docSnapshot) => {
      let data = docSnapshot.data()
      data = this._normalizeData(data);
      let resp = this._mergeDataAndId(docSnapshot.id, data);
      fetchedDocs.push(resp);
    })

    //Prepare response
    let response = {
      sortBy: sortBy,
      sortOrder: sortOrder,
      limit: limit,
      startAfter: startAfter,
      data: fetchedDocs
    }

    //Return final response
    return response;

  }

  async _get(id, params = {}) {
    //Obtain the Model to work on
    let ref = this._getCloudFirestoreRef(params);

    //Obtain document at the given path
    let docPath = id;
    const docRef = ref.doc(docPath);
    const snapshot = await docRef.get();
    if (snapshot.exists !== true) {
      throw new NotFound("Document not found")
    } else {
      let data = snapshot.data()
      data = this._normalizeData(data);
      let resp = this._mergeDataAndId(id, data);
      return resp;
    }

  }

  async _create(data, params = {}) {
    let ref = this._getCloudFirestoreRef(params);
    if (Array.isArray(data) === true && data.length > 0) {
      let resp = {
        "successful": 0,
        "failed": 0,
        "results": []
      };
      let status = "created";
      let message = "ok";
      let id = undefined;
      for (const dataOb of data) {
        try {
          let docRef = await ref.add(dataOb);
          id = docRef.id;
        } catch (exc) {
          status = "failed";
          message = exc.message
        }
        if (status === "created") {
          resp.successful++;
        } else {
          resp.failed++;
        }
        resp.results.push({
          id: id,
          status: status,
          message: message,
          data: this._normalizeData(dataOb)
        })
      }

      return resp;
    } else if (typeof data === 'object') {

      let resp = {
        "successful": 0,
        "failed": 0,
        "results": []
      };
      let status = "created";
      let message = "ok";
      let id = undefined;
      try {
        let docRef = await ref.add(data);
        id = docRef.id;
      } catch (exc) {
        status = "failed";
        message = exc.message
      }
      if (status === "created") {
        resp.successful++;
      } else {
        resp.failed++;
      }
      resp.results.push({
        id: id,
        status: status,
        message: message,
        data: this._normalizeData(data)
      })
      return resp;
    } else {
      throw new Error("Unable to resolve type of data")
    }
  }

  async _patch(id, data, params = {}) {
    //Obtain the Model to work on
    let ref = this._getCloudFirestoreRef(params);

    //Obtain document at the given path
    let docPath = id;
    const docRef = ref.doc(docPath);

    //Perform the patch operation
    await docRef.set(data, { merge: true })

    //Retrieve the latest doc
    const snapshot = await docRef.get();
    if (snapshot.exists !== true) {
      throw new Error("Document not found") //This is not a client error
    } else {
      let data = snapshot.data()
      data = this._normalizeData(data);
      let currentData = this._mergeDataAndId(id, data);
      return {
        status: "patched",
        message: "ok",
        data: currentData
      };
    }
  }

  async _update(id, data, params = {}) {
    //Obtain the Model to work on
    let ref = this._getCloudFirestoreRef(params);

    //Obtain document at the given path
    let docPath = id;
    const docRef = ref.doc(docPath);

    //Perform the update operation
    await docRef.set(data, { merge: false })

    //Retrieve the latest doc
    const snapshot = await docRef.get();
    if (snapshot.exists !== true) {
      throw new Error("Document not found") //This is not a client error
    } else {
      let data = snapshot.data()
      data = this._normalizeData(data);
      let currentData = this._mergeDataAndId(id, data);
      return {
        status: "updated",
        message: "ok",
        data: currentData
      };
    }
  }

  async _remove(id, params = {}) {
    let ref = this._getCloudFirestoreRef(params);
    let docPath = id;

    let docRef = ref.doc(docPath);
    const snapshot = await docRef.get();
    if (snapshot.exists !== true) {
      throw new NotFound("Document not found")
    } else {
      let data = snapshot.data()
      data = this._normalizeData(data);
      let lastData = this._mergeDataAndId(id, data);

      try {
        await docRef.delete();
        return {
          status: "deleted",
          message: "ok",
          data: lastData
        };
      } catch (exc) {
        throw new Error("Unable to delete document")
      }

    }

  }
}

module.exports = function init(options) {
  return new Service(options);
};

module.exports.Service = Service;