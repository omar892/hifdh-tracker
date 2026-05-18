import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import studentsRouter from "./students";
import entriesRouter from "./entries";
import statsRouter from "./stats";
import aiRouter from "./ai";
import quranRouter from "./quran";
import guardiansRouter from "./guardians";
import viewerAccessRouter from "./viewer-access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(studentsRouter);
router.use(entriesRouter);
router.use(statsRouter);
router.use(aiRouter);
router.use(quranRouter);
router.use(guardiansRouter);
router.use(viewerAccessRouter);

export default router;
