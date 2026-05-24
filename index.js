const express = require('express');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
dotenv.config();
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8080;
// const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGODB_URI;

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const logger = (req, res, next) => {
  console.log(`${req.method} | ${req.url}`);
  next();
};

const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;
  //   console.log(req.headers, 'from verify token');
  const token = authorization?.split(' ')[1];
  //   console.log(token);

  if (!token) {
    return res.status(401).json({ message: 'Unauthorize' });
  }

  try {
    const JWKS = createRemoteJWKSet(new URL('http://localhost:3000/api/auth/jwks'));
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.error('Token validation failed:', error);
    return res.status(401).json({ message: 'Unauthorize' });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    const db = client.db('mongoideas');
    const coursesCollection = db.collection('mongoideasdata');
    const enrollmentCollection = db.collection('enrollments');
    const commentsCollection = db.collection('comments');

    app.get('/ideas', async (req, res) => {
      console.log(req);

      const { search } = req.query;

      let cursor;
      //   console.log(search.search);

      //   console.log('from serch 1', search);
      if (search) {
        //   console.log('from serch 1');

        // React core concept => Core
        // cursor = await coursesCollection.find({
        //   title: {
        //     $regex: search,
        //     $options: 'i',
        //   },
        // });
        cursor = await coursesCollection.find({
          $or: [
            {
              IdeaTitle: {
                $regex: search,
                $options: 'i',
              },
            },
            {
              instructor: {
                $regex: search,
                $options: 'i',
              },
            },
          ],
        });

        // console.log(cursor, 'from search');
      } else {
        cursor = coursesCollection.find();
      }

      const result = await cursor.toArray();
      //   console.log(result);

      // console.log(result);
      res.send(result);
    });

    app.get('/featured', async (req, res) => {
      const cursor = coursesCollection.find().limit(4);
      const result = await cursor.toArray();
      res.send(result);
    });


    app.post("/ideas",  async (req, res) => {
      const ideasData = req.body;
      // console.log(ideasData);
      const result = await coursesCollection.insertOne(ideasData);

      res.send(result);
    });

    app.get('/my-ideas', async (req, res) => {
      const email = req.query.email;
      // console.log(email, 'from my ideas');
      if (!email) {
        return res.status(400).json({ message: 'Email query parameter is required' });
      }
      const myIdeas = await coursesCollection.find({ email: email }).toArray();

      res.status(200).json(myIdeas);
    });

    app.post("/comments", verifyToken, async (req, res) => {
      const CommentsData = req.body;
      // console.log(CommentsData);
      const result = await commentsCollection.insertOne(CommentsData);

      res.send(result);
    });

    app.get('/my-interactions', async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).json({ message: 'Email query parameter is required' });
      }
      const myInteractions = await commentsCollection.find({ email: email }).toArray();

      res.status(200).json(myInteractions);
    });

    app.get('/ideas/:ideasId', logger, verifyToken, async (req, res) => {
      // const ideasId = req.params.ideasId;
      //   console.log(req.user, 'req');

      const { ideasId } = req.params;

      const query = { _id: new ObjectId(ideasId) };
      const result = await coursesCollection.findOne(query);
      res.send(result);
    });

    app.get('/enrollments/:userId', verifyToken, async (req, res) => {
      const { userId } = req.params;
      const result = await enrollmentCollection.find({ userId: userId }).toArray();
      res.send(result);
    });

    app.patch('/enrollments/:courseId', verifyToken, async (req, res) => {
      //   console.log('from enrollment');

      const { courseId } = req.params;
      const enrollmentData = req.body;

      const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });

      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      await coursesCollection.updateOne(
        { _id: new ObjectId(courseId) },
        {
          $inc: { enrollCount: 1 },
          $set: {
            lastEnrolledAt: new Date(),
          },
        }
      );
      //   console.log(enrollmentData);

      const result = await enrollmentCollection.insertOne({
        ...enrollmentData,
        enrolledAt: new Date(),
      });

      res.send(result);
    });

    app.patch('/ideas/:ideasId', verifyToken, async (req, res) => {
      const { ideasId } = req.params;
      const updatedData = req.body;

      const result = await coursesCollection.updateOne(
        { _id: new ObjectId(ideasId) },
        { $set: updatedData }
      );
      res.json(result);
    });

    app.delete('/ideas/:ideasId', verifyToken, async (req, res) => {
      const { ideasId } = req.params;
      const result = await coursesCollection.deleteOne({ _id: new ObjectId(ideasId) });
      res.json(result);
    });

    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
