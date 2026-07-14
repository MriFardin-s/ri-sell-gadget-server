import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

dotenv.config();

const app: Express = express();
const port = 9000;

app.use(cors());
app.use(express.json());


app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

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




client.connect()
  .then(() => {
    console.log('Connected to MongoDB successfully!');
  })
  .catch((err) => {
    console.error('Failed to connect:', err);
  });



const database = client.db("ri-sell-gadget");
const gadgetsCollection = database.collection("gadgets");
const usersCollection = database.collection("user");
const sessionCollection = database.collection('session');

interface DbUser {
  _id: ObjectId;
  email: string;
  name: string;
  role?: string;
}

interface AuthenticatedRequest extends Request {
  user?: DbUser;
}

const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {

  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const query = { token: token };
  const session = await sessionCollection.findOne(query);

  if (!session) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const userId = session.userId;
  const userQuery = { _id: typeof userId === 'string' ? new ObjectId(userId) : userId };

  const user = await usersCollection.findOne(userQuery) as DbUser | null;
  if (!user) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  req.user = user;
  next();
};

//Public Routes

app.get('/api/gadgets', async (req: Request, res: Response) => {
  try {
    const {
      search = "",
      priority,
      condition,
      sort = "newest",
      page = "1",
      limit = "12",
    } = req.query;

    const query: any = {};

    if (search) {
      query.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { shortDescription: { $regex: search as string, $options: "i" } },
      ];
    }

    if (priority && priority !== "") {
      query.priority = priority;
    }
    if (condition && condition !== "") {
      query.condition = condition;
    }

    let sortOption: any = { createdAt: -1 };
    if (sort === "oldest") {
      sortOption = { createdAt: 1 };
    } else if (sort === "price-low") {
      sortOption = { price: 1 };
    } else if (sort === "price-high") {
      sortOption = { price: -1 };
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skipNum = (pageNum - 1) * limitNum;

    const totalItems = await gadgetsCollection.countDocuments(query);
    const gadgets = await gadgetsCollection
      .find(query)
      .project({
        "user.email": 0,
        "user.id": 0
      })
      .sort(sortOption)
      .skip(skipNum)
      .limit(limitNum)
      .toArray();

    res.send({
      gadgets,
      totalItems,
      totalPages: Math.ceil(totalItems / limitNum) || 1,
    });

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

    const gadget = await gadgetsCollection.findOne({ _id: new ObjectId(id) },
      {
        projection: {
          "user.email": 0,
          "user.id": 0
        }
      }
    );

    if (!gadget) {
      return res.status(404).send({ error: "Gadget not found" });
    }

    res.send(gadget);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch gadget details" });
  }
});

app.get('/api/latest-gadgets', async (req: Request, res: Response) => {
  try {
    const latestGadgets = await gadgetsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      data: latestGadgets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch latest gadgets"
    });
  }
});

app.get('/api/condition-stats', async (req: Request, res: Response) => {
  try {
    const stats = await gadgetsCollection.aggregate([
      {
        $match: {
          condition: { $exists: true, $ne: null }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: "$condition",
          count: { $sum: 1 },
          latestDoc: { $first: "$createdAt" }
        }
      },
      {
        $sort: { latestDoc: -1 }
      },
      {
        $project: {
          _id: 0,
          slug: "$_id",
          name: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          count: 1,
          iconKey: "$_id"
        }
      }
    ]).toArray();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch condition stats"
    });
  }
});

app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const totalUsers = await usersCollection.countDocuments({});
    const totalGadgets = await gadgetsCollection.countDocuments({});

    const lastYearUsers = await usersCollection.countDocuments({
      createdAt: { $gte: oneYearAgo }
    });

    const lastYearGadgets = await gadgetsCollection.countDocuments({
      createdAt: { $gte: oneYearAgo }
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalGadgets,
        lastYearUsers,
        lastYearGadgets
      }
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stats"
    });
  }
});


//Private


app.get('/api/manage-gadgets', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.query.email as string;
    const userRole = req.query.role as string;

    if (!userEmail) {
      return res.status(400).send({ error: "User email is required" });
    }

    let query = {};
    if (userRole !== "admin") {
      query = { "user.email": userEmail };
    }

    const gadgets = await gadgetsCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.send(gadgets);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch gadgets" });
  }
});

app.post('/api/add-gadget', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gadget = req.body;

    const gadgetWithTimestamp = {
      ...gadget,
      user: {
        id: req.user?._id,
        name: req.user?.name,
        email: req.user?.email
      },
      createdAt: new Date()
    };

    const result = await gadgetsCollection.insertOne(gadgetWithTimestamp);
    res.send(result);
  } catch (err) {
    console.error("Error inserting gadget:", err);
    res.status(500).send({ error: "Failed to add gadget" });
  }
});

app.delete('/api/delete-gadget/:id', verifyToken, async (
  req: AuthenticatedRequest & { params: { id: string } },
  res: Response
) => {
  try {
    const id: string = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid gadget ID format" });
    }

    const result = await gadgetsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Gadget not found" });
    }

    res.send({ success: true, message: "Gadget deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to delete gadget" });
  }
});

// await client.db("admin").command({ ping: 1 });
// console.log("Pinged your deployment. You successfully connected to MongoDB!");

//   } catch (error) {
//   console.error("Database connection error:", error);
// }
// }

// run().catch(console.dir);

// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });

export default app;