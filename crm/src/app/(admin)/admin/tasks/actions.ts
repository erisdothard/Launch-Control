"use server";

import { revalidatePath } from "next/cache";
import { createTask, setTaskDone, deleteTask, type CreateTaskInput } from "@/lib/store/tasks";

export async function createTaskAction(input: CreateTaskInput) {
  const task = await createTask(input);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/activity");
  return task;
}

export async function setTaskDoneAction(id: string, done: boolean) {
  await setTaskDone(id, done);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/activity");
}

export async function deleteTaskAction(id: string) {
  await deleteTask(id);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/activity");
}
