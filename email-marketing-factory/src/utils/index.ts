export const getRandomInt = (n: number): number => {
  return Math.floor(Math.random() * n)
}

export const getRandomIntWithMax = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const demoPattern = /^\/[a-z]{2}\/demo\//



