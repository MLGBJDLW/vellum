import { ProjectMemoryService } from "@vellum/core";

export async function withMemoryService<T>(
  projectPath: string,
  action: (service: ProjectMemoryService) => Promise<T>
): Promise<T> {
  const service = new ProjectMemoryService();
  await service.initialize(projectPath);

  try {
    return await action(service);
  } finally {
    await service.close();
  }
}
