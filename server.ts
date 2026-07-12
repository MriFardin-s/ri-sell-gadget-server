import express, { type Express, type Request, type Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

dotenv.config();

const app: Express = express();
const port = 9000;


app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;


if (!uri) {
  console.error("MONGO_DB_URI is missing in your .env file!");
  process.exit(1);
}

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

async function run() {
  try {

    await client.connect();

    const database = client.db("ri-sell-gadget");
    const gadgetsCollection = database.collection("gadgets");

    // user 

    app.get('/api/gadgets', async (req: Request, res: Response) => {
      try {
        const gadgets = await gadgetsCollection.find().toArray();
        res.send(gadgets);
      } catch (err) {
        console.error("Error fetching gadgets:", err);
        res.status(500).send({ error: "Failed to fetch gadgets" });
      }
    });



    app.get('/api/gadgets/:id', async (req: Request<{ id: string }>, res: Response) => {
      try {
        const id: string = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid gadget ID format" });
        }

        const gadget = await gadgetsCollection.findOne({ _id: new ObjectId(id) });

        if (!gadget) {
          return res.status(404).send({ error: "Gadget not found" });
        }

        res.send(gadget);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch gadget details" });
      }
    });

    



    app.post('/api/add-gadget', async (req: Request, res: Response) => {
      try {
        const gadget = req.body;
        const result = await gadgetsCollection.insertOne(gadget);
        res.send(result);
      } catch (err) {
        console.error("Error inserting gadget:", err);
        res.status(500).send({ error: "Failed to add gadget" });
      }
    });


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } catch (error) {
    console.error("Database connection error:", error);
  }
}


run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});