var sqlite3 = require('sqlite3').verbose(),
    app = require('express')(),
    http = require('http').Server(app),
    bodyParser = require('body-parser');

var db;

var tableName = 'sensorData';

var serverPort = 3300

/*****************************************************************************/
/*** Helpers *****************************************************************/
/*****************************************************************************/

/**
 * Returns the current timestamp to be used when logging to console.
 */
function getLogTimestamp () {
  return '['+(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''))+'] ';
}

/*****************************************************************************/
/*** Functionality ***********************************************************/
/*****************************************************************************/

function initDatabase () {

  // Open connection to the database
  db = new sqlite3.Database('data.db', function (error) {

    if (error) {
      console.log(getLogTimestamp()+'ERROR: Unable to open database');
    } else {

      // If the sensor data table does not exist yet, create it
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='"+tableName+"'", [], function (error, data) {

        if (error) {
          console.log(getLogTimestamp()+'ERROR: Error checking for sensor data table');
        } else if (data === undefined) {
          console.log(getLogTimestamp()+'INFO: Table for sensor data does not yet exist. Creating.');
          createTable();
        } else {
          // Perfect! Nothing to do.
        }

      });

    }

  });

}

/**
 * Create the table to store sensor data.
 */
function createTable () {
  db.run("CREATE TABLE "+tableName+" (deviceId TEXT, plantName TEXT, timestamp INT, frequency REAL)");
  console.log(getLogTimestamp()+'INFO: Created table to store sensor data');
}

/**
 * Insert sensor data into the table.
 *
 * @param deviceId    Unique ID of the device to add sensor data for
 * @param plantName   The plant name
 * @param frequency   The frequency measured in Hz
 */
function insertData (deviceId, plantName, frequency) {

  var timestamp = new Date();
      timestamp = Math.round(timestamp.getTime() / 1000);

  db.run("INSERT INTO "+tableName+" (deviceId, plantName, timestamp, frequency) VALUES ('"+deviceId+"', '"+plantName+"' ,'"+timestamp+"', '"+frequency+"')");
  console.log(getLogTimestamp()+'INFO: Inserted sensor data into database')

}

/**
 * Get latest sensor data for a given device from the table.
 *
 * @param deviceId Unique ID of the device to get data for
 * @param res      Response object for the HTTP request
 * @param [jsonpCallback] Function name for a JSONP callback
 */
function getLatestData (deviceId, res, jsonpCallback) {

  db.get("SELECT * FROM "+tableName+" WHERE deviceId='"+deviceId+"' ORDER BY timestamp DESC LIMIT 1", function (error, row) {

    if (error) {
      console.log(getLogTimestamp()+'ERROR: Unable to get sensor data from database');
      res.status(500).send({});
    } else if (row === undefined) {
      console.log(getLogTimestamp()+'ERROR: Could not find any sensor data for the given device');
      res.status(500).send({});
    } else {
      console.log(getLogTimestamp()+'INFO: Delivering requested sensor data to client');

      var resultToDeliver = {
        'deviceId': row.deviceid,
	'timestamp': row.timestamp,
	'plantName': row.plantName,
        'frequency': row.frequency
      };

      if (jsonpCallback) {
        res.status(200).send(jsonpCallback + '(' + JSON.stringify(resultToDeliver) + ')');
      } else {
        res.status(200).send(resultToDeliver);
      }

    }

  });

}

/**
 * Get all sensor data for a given device from the table.
 *
 * @param deviceId        Unique ID of the device to get data for
 * @param res             Response object for the HTTP request
 * @param [jsonpCallback] Function name for a JSONP callback
 */
function getAllData (deviceId, res, jsonpCallback) {

  db.all("SELECT * FROM "+tableName+" WHERE deviceId='"+deviceId+"' ORDER BY timestamp DESC", function (error, result) {

    if (error) {
      console.log(getLogTimestamp()+'ERROR: Unable to get sensor data from database');
      res.status(500).send({});
    } else if (result === undefined) {
      console.log(getLogTimestamp()+'ERROR: Could not find any sensor data for the given device');
      res.status(500).send({});
    } else {
      console.log(getLogTimestamp()+'INFO: Delivering requested sensor data to client');

      var resultsToDeliver = [];
      for (var i = 0; i < result.length; i++) {
        resultsToDeliver.push({
          'deviceId': result[i].deviceid,
          'plantName': result[i].plantName,
	  'timestamp': result[i].timestamp,
          'frequency': result[i].frequency,
        });
      }

      if (jsonpCallback) {
        res.status(200).send(jsonpCallback + '(' + JSON.stringify({ 'count': resultsToDeliver.length, 'results': resultsToDeliver }) + ')');
      } else {
        res.status(200).send({ 'count': resultsToDeliver.length, 'results': resultsToDeliver });
      }

    }

  });

}

/**
 * Get list of all devices available.
 *
 * @param res             Response object for the HTTP request
 * @param [jsonpCallback] Function name for a JSONP callback
 */
function getDevices (res, jsonpCallback) {

  db.all("SELECT DISTINCT deviceId FROM "+tableName, function (error, result) {

    if (error) {
      console.log(getLogTimestamp()+'ERROR: Unable to get list of devices from database');
      res.status(500).send({});
    } else if (result === undefined) {
      console.log(getLogTimestamp()+'ERROR: Could not find any devices');
      res.status(500).send({});
    } else {
      console.log(getLogTimestamp()+'INFO: Delivering list of devices to client');

      var resultsToDeliver = [];
      for (var i = 0; i < result.length; i++) {
        resultsToDeliver.push(result[i].deviceid);
      }

      if (jsonpCallback) {
        res.status(200).send(jsonpCallback + '(' + JSON.stringify({ 'count': resultsToDeliver.length, 'results': resultsToDeliver }) + ')');
      } else {
        res.status(200).send({ 'count': resultsToDeliver.length, 'results': resultsToDeliver });
      }

    }

  });

}

/**
 * Delete sensor data for a given device from the table.
 *
 * @param deviceId Unique ID of the device to delete data for
 * @param res      Response object for the HTTP request
 */
function deleteData (deviceId, res) {

  db.get("DELETE FROM "+tableName+" WHERE deviceId='"+deviceId+"'", function (error, row) {

    if (error) {
      console.log(getLogTimestamp()+'ERROR: Unable to delete sensor data from database');
      res.sendStatus(500);
    } else {
      console.log(getLogTimestamp()+'INFO: Deleted sensor data for requested device');
      res.sendStatus(200);
    }

  });

}

/*****************************************************************************/
/*** Express Routing *********************************************************/
/*****************************************************************************/

// Set up express to understand POST params in request bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Route to post sensor data to
app.post('/data', function (req, res) {

  console.log(getLogTimestamp()+'INFO: Received sensor data from device '+req.body.id+' from '+req.body.plantName+' (Frequency: '+req.body.f+' Hz)');

  // Insert the received data into the database
  insertData(req.body.id, req.body.plantName, req.body.f);

  // Always send a 200 response, the NodeMCU is not checking this anyways
  res.sendStatus(200);

});

// Route to get the latest sensor data for a given device
app.get('/data/latest/:deviceId', function (req, res) {
  console.log(getLogTimestamp()+'INFO: Latest sensor data for device '+req.params.deviceId+' requested');
  getLatestData(req.params.deviceId, res, req.query.callback);
});

// Route to get all sensor data for a given device
app.get('/data/all/:deviceId', function (req, res) {
  console.log(getLogTimestamp()+'INFO: All sensor data for device '+req.params.deviceId+' requested');
  getAllData(req.params.deviceId, res, req.query.callback);
});

// Route to get a list of all devices available
app.get('/devices', function (req, res) {
  console.log(getLogTimestamp()+'INFO: Get list of all devices available');
  getDevices(res, req.query.callback);
});

// Route to delete historic sensor data for a given device
app.delete('/data/:deviceId', function (req, res) {
  console.log(getLogTimestamp()+'INFO: Deletion of data for device '+req.params.deviceId+' requested');
  deleteData(req.params.deviceId, res);
});

/*****************************************************************************/
/*** Hey, ho, let's go! ******************************************************/
/*****************************************************************************/

http.listen(serverPort, function () {

  // Initialize the database
  console.log(getLogTimestamp()+'INFO: Initializing database');
  initDatabase();

  console.log(getLogTimestamp()+'INFO: Server started and listening on *:'+serverPort);

});
