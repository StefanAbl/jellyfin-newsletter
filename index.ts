
import axios, { AxiosResponse } from 'axios'
import Handlebars from 'handlebars'
import * as fs from 'node:fs'
import nodemailer from 'nodemailer'
import config from 'config'
import { exit } from 'node:process'


class Api {
  baseUrl: string
  token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl,
      this.token = token
  }


  async getItemsForUser(userId: string, limit: number = 10): Promise<AxiosResponse> {
    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: this.baseUrl + 'Users/' + userId + '/Items/Latest?sortBy=DateCreated&fields=Overview&limit=' + limit + '&userId=' + userId,
      headers: {
        'X-Emby-Token': this.token
      }
    };

    return axios.request(config)
  }
  async getUsers(): Promise<AxiosResponse> {
    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: this.baseUrl + 'Users',
      headers: {
        'X-Emby-Token': this.token
      }
    };

    return axios.request(config)
  }
}

type Entry = {
  title: string
  url: string
  imageUrl: string
  description: string
}
type ConfigUser = {
  name: string
  mail: string
}
type Recipient = {
  name: string
  id: string
  mail: string
}

async function getEntriesForUser(userId: string): Promise<Entry[]> {
  let entries: Entry[] = []
  try {
    const resp = await api.getItemsForUser(userId, 10)

    await resp.data.forEach((element: any) => {
      let e: Entry = {
        title: '',
        url: `${baseUrl}web/index.html#!/details?id=${element.Id}&context=home&serverId=${element.ServerId}`,
        imageUrl: '',
        description: element.Overview
      }
      switch (element.Type) {
        case 'Episode':
          e.title += `New ${element.Type}: ${element.SeriesName} - ${element.Name}`
          e.imageUrl = `${baseUrl}Items/${element.SeriesId}/Images/Primary?fillHeight=200&fillWidth=356&quality=96&tag=${element.SeriesPrimaryTag}`
          break;

        case 'Movie':
          e.title += `New Movie ${element.Name} (${element.ProductionYear})`
          e.imageUrl = `${baseUrl}Items/${element.Id}/Images/Primary?fillHeight=200&fillWidth=356&quality=96&tag=${element.ImageTags.Primary}`
          break;
        case 'Series':
          //console.log(element)
          if (element.UserData.UnplayedItemCount == 1) {
            e.title += 'A new Epsiode of '
          } else {
            e.title += element.UserData.UnplayedItemCount + ' new Episodes of '
          }

          e.title += element.Name + ' (' + element.ProductionYear
          if (element.EndDate) {
            e.title += ' - ' + element.EndDate.substring(0, 4) + ')'
          } else {
            e.title += ' - Present)'
          }
          e.imageUrl = `${baseUrl}Items/${element.Id}/Images/Primary?fillHeight=200&fillWidth=356&quality=96&tag=${element.ImageTags.Primary}`
          break;

        default:
          console.log("Unknown Type ", element.Type)
          console.log(element)
      }
      entries.push(e)
    });
  } catch (err) {
    console.error(err)
    exit(1)
  }
  return entries;
}

async function getUserIds(): Promise<Recipient[]> {
  let recipients: Recipient[] = []
  try {
    const resp = await api.getUsers()
    const configuredUsers = config.get<ConfigUser[]>('recipients')
    for (const configuredUser of configuredUsers) {
      //console.log("Response", resp.data)
      const id = resp.data.filter((u: any) => u.Name == configuredUser.name)[0].Id
      recipients.push({
        name: configuredUser.name,
        mail: configuredUser.mail,
        id: id
      })
    }
  } catch (err) {
    console.error(err)
    exit(1)
  }
  return recipients;
}


const baseUrl: string = config.get('baseUrl')
const token: string = config.get('token')


const transporter = nodemailer.createTransport({
  host: config.get<string>('mail.host'),
  port: config.get<number>('mail.port'),
  secure: config.get<boolean>('mail.secure'),
  auth: {
    // TODO: replace `user` and `pass` values from <https://forwardemail.net>
    user: config.get('mail.auth.user'),
    pass: config.get('mail.auth.pass'),
  },
});



const api = new Api(baseUrl, token)


Handlebars.registerPartial("entry", fs.readFileSync('./templates/entry.html').toString())

const bodyTemplate = Handlebars.compile(fs.readFileSync('./templates/body.html').toString())

getUserIds().then((recipients) => {
  recipients.forEach((recipient) => {

    getEntriesForUser(recipient.id).then((entries) => {

      const htmlNewsletter = bodyTemplate({
        entries: entries,
        date: new Date().toDateString(),
        imageUrl: baseUrl + '/web/assets/img/banner-dark.png',
        baseUrl: baseUrl
      })
      fs.writeFileSync(`./${recipient.name}.out.html`, htmlNewsletter)
      if (config.get<boolean>('send')) {
        transporter.sendMail({
          from: config.get('mail.from'), // sender address
          to: recipient.mail, // list of receivers
          subject: config.get('mail.subject'), // Subject line
          // text: "Hello world?", // plain text body
          html: htmlNewsletter, // html body
          replyTo: config.get('mail.replyTo')
        }).then((info) => console.log(info))
      }
    })
  })
})