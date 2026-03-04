export type layoutFormType = {
  system_prompt: string
  user_prompt?: string
  user_context: string
}

export type mjmlGenType = {
  system_prompt: string
  user_prompt?: string
  user_context: string
}

export type sectionType = {
  template_id?: string;
  html: string;
  description: string;
  index: string;
  title: string;
};


export type imageFormType = {
  imageUrl: string
  prompt: string
}


