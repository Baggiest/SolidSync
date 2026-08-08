import { VERSION } from '../version'

export async function runVersion(): Promise<number> {
  console.log(VERSION)
  return 0
}